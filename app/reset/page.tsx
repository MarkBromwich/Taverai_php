import { Suspense } from "react";
import ResetClient from "./ResetClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <ResetClient />
    </Suspense>
  );
}