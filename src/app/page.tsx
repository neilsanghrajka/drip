import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Drip</CardTitle>
          <CardDescription>
            Next.js, TypeScript, shadcn/ui, Vercel, and Convex are ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Start shaping the product from{" "}
            <code className="font-mono">src/app/page.tsx</code>.
          </p>
          <Button type="button">Ready to build</Button>
        </CardContent>
      </Card>
    </main>
  );
}
