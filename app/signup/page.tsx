import { Suspense } from "react";
import SignupClient from "./SignUpClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <SignupClient />
    </Suspense>
  );
}