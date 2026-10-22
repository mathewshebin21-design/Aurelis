import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f4f1] p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-[#6b7079]">Previews live at /a, /b and /c. Company routes accept the illustrative tickers only.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-[#2563eb] underline">Back to the design hub</Link>
      </div>
    </main>
  );
}
