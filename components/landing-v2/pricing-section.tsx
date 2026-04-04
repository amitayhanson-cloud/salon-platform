"use client"

import { useRef, useEffect, useLayoutEffect, useState } from "react"
import { PropertyBookingCard } from "./property-booking-card"

const properties = [
  {
    propertyName: "Sunset Beach Villa",
    location: "Malibu, California",
    duration: "Min. 3 nights",
    availableDate: "Available now",
    image: "/images/property-beach-villa.jpg",
    pricePerNight: 450,
    propertyType: "Beachfront Villa",
    features: ["Ocean View", "Private Beach", "Hot Tub", "Chef Kitchen"],
    amenities: ["Free Wifi", "Parking", "Pool"],
    rating: 4.9,
  },
  {
    propertyName: "Mountain Retreat Cabin",
    location: "Aspen, Colorado",
    duration: "Min. 2 nights",
    availableDate: "Dec 15 - Jan 30",
    image: "/images/property-mountain-cabin.jpg",
    pricePerNight: 320,
    propertyType: "Mountain Cabin",
    features: ["Ski-in/Ski-out", "Fireplace", "Mountain Views", "Game Room"],
    amenities: ["Free Wifi", "Parking", "4 Guests"],
    rating: 4.8,
  },
  {
    propertyName: "Downtown Luxury Loft",
    location: "New York City, NY",
    duration: "Min. 1 night",
    availableDate: "Available now",
    image: "/images/property-city-loft.jpg",
    pricePerNight: 280,
    propertyType: "City Loft",
    features: ["Skyline View", "Rooftop Access", "Designer Interior", "Central Location"],
    amenities: ["Free Wifi", "2 Guests", "Parking"],
    rating: 4.7,
  },
  {
    propertyName: "Tuscan Countryside Estate",
    location: "Florence, Italy",
    duration: "Min. 4 nights",
    availableDate: "Available now",
    image: "/images/property-tuscan-estate.jpg",
    pricePerNight: 520,
    propertyType: "Country Estate",
    features: ["Vineyard Views", "Private Pool", "Wine Cellar", "Olive Grove"],
    amenities: ["Free Wifi", "Parking", "8 Guests"],
    rating: 4.9,
  },
  {
    propertyName: "Tropical Paradise Bungalow",
    location: "Bali, Indonesia",
    duration: "Min. 2 nights",
    availableDate: "Available now",
    image: "/images/property-tropical-bungalow.jpg",
    pricePerNight: 180,
    propertyType: "Jungle Bungalow",
    features: ["Rice Terrace View", "Open Air Living", "Private Garden", "Yoga Deck"],
    amenities: ["Free Wifi", "Pool", "2 Guests"],
    rating: 4.8,
  },
  {
    propertyName: "Lakefront Modern House",
    location: "Lake Tahoe, California",
    duration: "Min. 3 nights",
    availableDate: "Year-round",
    image: "/images/property-lakefront-modern.jpg",
    pricePerNight: 380,
    propertyType: "Lakefront Home",
    features: ["Lake Access", "Private Dock", "Floor-to-ceiling Windows", "Hot Tub"],
    amenities: ["Free Wifi", "Parking", "6 Guests"],
    rating: 4.9,
  },
]

/** Enough copies that the strip always covers wide viewports; loop length = stride between adjacent groups */
const GROUP_COUNT = 8
const GROUP_KEYS = Array.from({ length: GROUP_COUNT }, (_, i) => i)

export function PricingSection() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const loopStrideRef = useRef(0)

  const [isHovered, setIsHovered] = useState(false)
  const positionRef = useRef(0)
  const animationRef = useRef<number | null>(null)

  const measureStride = () => {
    const row = scrollRef.current
    if (!row || row.children.length < 2) return

    const a = row.children[0] as HTMLElement
    const b = row.children[1] as HTMLElement
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    // Under document `dir=rtl`, flex row order is mirrored → raw delta can be negative
    let stride = Math.abs(rb.left - ra.left)
    if (!Number.isFinite(stride) || stride < 8) {
      stride = Math.abs(b.offsetLeft - a.offsetLeft)
    }
    if (Number.isFinite(stride) && stride > 0) {
      loopStrideRef.current = stride
    }
  }

  useLayoutEffect(() => {
    measureStride()
    const row = scrollRef.current
    const ro = new ResizeObserver(() => measureStride())
    if (row) {
      Array.from(row.children).forEach((child) => ro.observe(child))
      ro.observe(row)
    }
    window.addEventListener("resize", measureStride)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measureStride)
    }
  }, [])

  useEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return

    const speed = isHovered ? 0.3 : 1
    let lastTime = performance.now()

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime
      lastTime = currentTime

      measureStride()
      const stride = loopStrideRef.current

      if (stride <= 0) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      positionRef.current += speed * (deltaTime / 16)

      while (positionRef.current >= stride) {
        positionRef.current -= stride
      }

      scrollContainer.style.transform = `translate3d(-${positionRef.current}px,0,0)`
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current != null) cancelAnimationFrame(animationRef.current)
    }
  }, [isHovered])

  return (
    <section id="pricing" className="overflow-hidden bg-white py-32" dir="ltr">
      <div className="mx-auto mb-20 max-w-7xl px-6 text-center">
        <h2 className="mb-6 font-serif text-4xl font-normal text-balance md:text-5xl">
          Featured properties
        </h2>
        <p className="mx-auto max-w-2xl leading-relaxed text-muted-foreground">
          Discover handpicked homes from verified owners. Book with confidence.
        </p>
      </div>

      <div
        className="relative w-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={scrollRef}
          className="flex w-max gap-6 will-change-transform"
          dir="ltr"
        >
          {GROUP_KEYS.map((groupIndex) => (
            <div key={groupIndex} className="flex shrink-0 gap-6">
              {properties.map((property, i) => (
                <div
                  key={`${groupIndex}-${property.propertyName}-${i}`}
                  className="w-[85vw] shrink-0 sm:w-[60vw] lg:w-[400px]"
                >
                  <PropertyBookingCard
                    {...property}
                    onBook={() => console.log(`Booking ${property.propertyName}`)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
