import { ArrowUpRight, ArrowRight, FileEdit } from "lucide-react"
import Image from "next/image"

const articles = [
  {
    title: "Savings by age: Rules to know how much you should save",
    category: "Guides",
    date: "Jan 30, 2026",
    image: "/images/card-marble.png",
  },
  {
    title: "Banking is now available on your wrist: watchOS app is out!",
    category: "Updates",
    date: "Jan 30, 2026",
    image: "/images/watch-hand.png",
  },
]

export function BlogSection() {
  return (
    <section id="blog" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ADA996] to-[#F2F2F2] rounded-full mb-6">
            <FileEdit className="w-4 h-4 text-black" />
            <span className="text-xs text-black uppercase tracking-widest">Blog</span>
          </div>
          <h2 className="font-sans text-5xl font-normal mb-6">News & articles</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Stay informed with our latest updates, insightful articles, and expert opinions on banking trends, financial
            planning, and market information.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {articles.map((article, index) => (
            <div key={index} className="group cursor-pointer">
              <div className="bg-card rounded-2xl overflow-hidden border border-border mb-4 aspect-[4/3] relative">
                <Image
                  src={article.image || "/public/images/watch-hand.png"}
                  alt={article.title}
                  fill
                  className="object-cover"
                />
              </div>
              <h3 className="text-foreground mb-3 group-hover:opacity-80 transition-opacity text-lg">
                {article.title}
              </h3>
              <div className="flex items-center gap-4">
                <span className="px-3 py-1 border border-border rounded-full text-xs text-foreground">
                  {article.category}
                </span>
                <span className="text-sm text-muted-foreground">{article.date}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button className="relative flex items-center gap-0 border border-border rounded-full pl-6 pr-1.5 py-1.5 transition-all duration-300 group overflow-hidden">
            <span className="absolute inset-0 bg-foreground rounded-full scale-x-0 origin-right group-hover:scale-x-100 transition-transform duration-300" />
            <span className="text-sm text-foreground group-hover:text-background pr-4 uppercase tracking-wide relative z-10 transition-colors duration-300">
              Browse all articles
            </span>
            <span className="w-10 h-10 rounded-full flex items-center justify-center relative z-10">
              <ArrowRight className="w-4 h-4 text-foreground group-hover:opacity-0 absolute transition-opacity duration-300" />
              <ArrowUpRight className="w-4 h-4 text-foreground group-hover:text-background opacity-0 group-hover:opacity-100 transition-all duration-300" />
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}
