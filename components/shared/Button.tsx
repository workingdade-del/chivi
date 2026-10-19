"use client";

import { forwardRef, useState } from "react";

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  /** Force l'état "en cours" (sinon déduit automatiquement d'un onClick qui retourne une Promise). */
  pending?: boolean;
  /** Texte affiché pendant l'action (par défaut, le contenu normal + spinner). */
  pendingLabel?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
};

/**
 * Bouton commun CHIVI. L'apparence (survol, clic, focus, désactivé, zone
 * tactile, reduced-motion) vient du CSS global (app/globals.css) et s'applique
 * déjà à tout <button> ; ce composant ajoute l'état « en cours » :
 * si onClick retourne une Promise (ex. `onClick={() => handleDelete(id)}`),
 * le bouton se désactive, affiche un spinner et ignore les re-clics jusqu'à
 * la fin — plus de clics « perdus » ni de doubles envois.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { pending: pendingProp, pendingLabel, onClick, disabled, children, ...rest },
  ref
) {
  const [autoPending, setAutoPending] = useState(false);
  const pending = pendingProp ?? autoPending;

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (pending || disabled || !onClick) return;
    const result = onClick(e);
    if (result instanceof Promise) {
      setAutoPending(true);
      try {
        await result;
      } finally {
        setAutoPending(false);
      }
    }
  }

  return (
    <button ref={ref} {...rest} onClick={handleClick} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending && <span className="btn-spinner" aria-hidden="true" />}
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </button>
  );
});
