import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/landing-v2/ui/accordion"
import { GradientBarsSection } from "@/components/landing-v2/gradient-bars-section"

const faqs = [
  {
    question: "How do I post a listing on Caleno?",
    answer:
      "It's very simple! Create an account, click 'Post a listing', add photos and a description of your property, set the price and availability. Your listing will be live within minutes after verification.",
  },
  {
    question: "What are the fees for owners?",
    answer:
      "Caleno charges a 3% commission only when a rental is confirmed. No listing fees, no mandatory subscription. The Pro plan at $49/month reduces the commission to 2% for multi-property owners.",
  },
  {
    question: "How are tenants verified?",
    answer:
      "Each tenant must provide an ID and proof of income. We verify these documents and assign a trust score. Owners can view the complete profile before accepting a request.",
  },
  {
    question: "Are payments secure?",
    answer:
      "Yes, all payments go through our secure platform. Funds are held until check-in confirmation, then released to the owner. In case of disputes, our team intervenes to find a solution.",
  },
  {
    question: "What does the damage insurance cover?",
    answer:
      "Our included insurance covers material damage up to $5,000 per rental. It protects owners against accidental damage. A $200 deductible applies in case of a claim.",
  },
  {
    question: "Can I cancel a reservation?",
    answer:
      "Cancellation conditions are set by each owner (flexible, moderate, or strict). Refunds are calculated based on these conditions. Force majeure cases may qualify for a full refund.",
  },
]

export function FAQSection() {
  return (
    <GradientBarsSection id="faq" numBars={7} animationDuration={2} contentClassName="py-32 pb-80">
      <div className="mx-auto w-full max-w-4xl px-2 sm:px-4">
        <div className="mb-16 text-center">
          <h2 className="mb-6 text-balance font-serif text-4xl font-normal md:text-5xl">
            Frequently asked questions
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl leading-relaxed">
            Everything you need to know about Caleno. Have a question not listed? Contact our support.
          </p>
        </div>

        <Accordion type="single" collapsible className="my-0 space-y-3 py-0">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-2xl border border-white/45 bg-white/[0.38] px-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.32),0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl backdrop-saturate-150 data-[state=open]:border-white/55 data-[state=open]:bg-white/[0.48] data-[state=open]:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_4px_20px_rgba(15,23,42,0.06)]"
            >
              <AccordionTrigger className="text-foreground py-5 text-left text-base font-medium hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-5 text-sm leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </GradientBarsSection>
  )
}
