import Link from "next/link";
import Image from "next/image";
import { FOOTER } from "@/lib/landingContent";

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; href: string }[];
}) {
  return (
    <div className="w-full text-right">
      <h3 className="text-sm font-semibold leading-tight text-caleno-ink">{title}</h3>
      <ul className="mt-4 space-y-3" role="list">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="text-sm font-normal leading-relaxed text-gray-500 hover:text-caleno-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer data-waitlist-chrome="footer" dir="rtl" className="border-t border-gray-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 md:py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <FooterColumn title={FOOTER.product.title} links={FOOTER.product.links} />
          <FooterColumn title={FOOTER.company.title} links={FOOTER.company.links} />
          <FooterColumn title={FOOTER.legal.title} links={FOOTER.legal.links} />
          <FooterColumn title={FOOTER.social.title} links={FOOTER.social.links} />
        </div>
        <div className="mt-10 border-t border-gray-200 pt-8 space-y-6">
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Powered by</span>
            <a
              href="https://www.igani.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2 rounded"
              aria-label="Igani"
            >
              <Image
                src="/igani-logo.png"
                alt="Igani"
                width={120}
                height={40}
                className="h-8 w-auto object-contain"
              />
            </a>
          </div>
          <p className="text-center text-sm font-normal leading-relaxed text-gray-500">{FOOTER.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
