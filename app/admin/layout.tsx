export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-[100dvh] bg-[#0B3A4A]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 bg-[#0B3A4A]" />
      <div className="relative z-20 bg-[#0B3A4A]">{children}</div>
    </div>
  );
}
