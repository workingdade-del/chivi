import { CuisineSidebar } from "@/components/cuisine/CuisineSidebar";
import { CuisineBottomNav } from "@/components/cuisine/CuisineBottomNav";
import { CuisineMobileTopBar } from "@/components/cuisine/CuisineMobileTopBar";
import { InboundMessageNotifier } from "@/components/shared/InboundMessageNotifier";

export default function CuisineShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-app-cuisine flex flex-col md:flex-row">
      <InboundMessageNotifier />
      <CuisineSidebar />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <CuisineMobileTopBar />
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
      <CuisineBottomNav />
    </div>
  );
}
