import crypto from "crypto";

/**
 * Protocole de chiffrement du data endpoint WhatsApp Flow : la clé AES est
 * chiffrée en RSA-OAEP (clé privée CHIVI), le corps en AES-128-GCM. La
 * réponse est chiffrée avec la même clé AES mais un IV inversé bit à bit
 * (exigence du protocole Meta) — voir la doc "Flows > Implementing Your
 * Endpoint". Serveur uniquement.
 */

export interface DecryptedFlowRequest {
  version: string;
  action: "ping" | "INIT" | "data_exchange" | "BACK" | string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

export interface FlowRequestBody {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

function getPrivateKey() {
  const pem = (process.env.WHATSAPP_FLOW_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!pem) {
    throw new Error("WHATSAPP_FLOW_PRIVATE_KEY n'est pas configurée");
  }
  return pem;
}

export function decryptFlowRequest(body: FlowRequestBody): {
  payload: DecryptedFlowRequest;
  aesKey: Buffer;
  iv: Buffer;
} {
  const aesKey = crypto.privateDecrypt(
    {
      key: getPrivateKey(),
      passphrase: process.env.WHATSAPP_FLOW_PASSPHRASE,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(body.encrypted_aes_key, "base64")
  );

  const flowDataBuffer = Buffer.from(body.encrypted_flow_data, "base64");
  const iv = Buffer.from(body.initial_vector, "base64");
  const TAG_LENGTH = 16;
  const encryptedBody = flowDataBuffer.subarray(0, flowDataBuffer.length - TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(flowDataBuffer.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedBody), decipher.final()]);

  return { payload: JSON.parse(decrypted.toString("utf8")) as DecryptedFlowRequest, aesKey, iv };
}

export function encryptFlowResponse(responseObj: unknown, aesKey: Buffer, iv: Buffer): string {
  const flippedIv = Buffer.from(iv.map((b) => ~b & 0xff));
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(responseObj), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]).toString("base64");
}
