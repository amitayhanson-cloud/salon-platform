export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No Header or Footer - public salon sites have their own header/footer
  return <div className="min-w-0 w-full overflow-x-hidden">{children}</div>;
}
