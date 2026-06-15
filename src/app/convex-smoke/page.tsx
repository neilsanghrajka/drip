import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ConvexSmokeClient } from "./ConvexSmokeClient";

export default function ConvexSmokePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Backend Smoke</CardTitle>
          <CardDescription>
            Production verifies this page through a live backend query.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConvexSmokeClient />
        </CardContent>
      </Card>
    </main>
  );
}
