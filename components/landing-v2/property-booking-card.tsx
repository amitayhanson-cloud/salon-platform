"use client"

import Image from "next/image"
import { Home, Calendar, MapPin, Users, Wifi, Car, Waves } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PropertyBookingCardProps {
  propertyName: string
  location: string
  duration: string
  availableDate: string
  image: string
  pricePerNight: number
  currency?: string
  propertyType?: string
  features?: string[]
  amenities?: string[]
  rating?: number
  onBook?: () => void
  className?: string
}

export function PropertyBookingCard({
  propertyName,
  location,
  duration,
  availableDate,
  image,
  pricePerNight,
  currency = "$",
  propertyType,
  features = [],
  amenities = [],
  rating,
  onBook,
  className,
}: PropertyBookingCardProps) {
  return (
    <div
      className={cn("w-full h-full flex flex-col overflow-hidden rounded-3xl bg-white shadow-card", className)}
      style={{
        boxShadow:
          "rgba(14, 63, 126, 0.04) 0px 0px 0px 1px, rgba(42, 51, 69, 0.04) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.04) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.04) 0px 6px 6px -3px, rgba(14, 63, 126, 0.04) 0px 12px 12px -6px, rgba(14, 63, 126, 0.04) 0px 24px 24px -12px",
      }}
    >
      {/* Image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <Image src={image || "/placeholder.svg"} alt={propertyName} fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {rating && (
          <div className="absolute left-3 top-3 rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold text-white backdrop-blur-sm">
            ★ {rating}
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3">
          <div className="mb-1 flex items-center gap-2">
            <Home className="h-5 w-5 text-white" />
            {propertyType && <span className="text-sm font-medium text-white/90">{propertyType}</span>}
          </div>
          <h3 className="text-balance text-2xl font-bold text-white">{propertyName}</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 flex flex-col">
        {/* Property details */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin className="h-4 w-4" />
            <span>{location}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="h-4 w-4" />
            <span>
              {availableDate} • {duration}
            </span>
          </div>
        </div>

        {/* Features */}
        {features.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">Property Highlights</div>
            <div className="flex flex-wrap gap-2">
              {features.slice(0, 3).map((feature, index) => (
                <span key={index} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  {feature}
                </span>
              ))}
              {features.length > 3 && (
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  +{features.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Amenities */}
        {amenities.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3">
            {amenities.slice(0, 3).map((amenity, index) => {
              let Icon = Users
              if (amenity.toLowerCase().includes("wifi")) Icon = Wifi
              if (amenity.toLowerCase().includes("parking")) Icon = Car
              if (amenity.toLowerCase().includes("pool")) Icon = Waves

              return (
                <div key={index} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Icon className="h-4 w-4" />
                  <span>{amenity}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Price & button */}
        <div className="flex items-center justify-between mt-auto pt-4">
          <div>
            <div className="text-sm text-slate-500">From</div>
            <div className="text-2xl font-bold text-slate-900">
              {currency}
              {pricePerNight}
              <span className="text-sm font-normal text-slate-500">/night</span>
            </div>
          </div>
          <button
            onClick={onBook}
            className="rounded-xl bg-foreground px-6 py-3 font-semibold text-background transition-colors hover:bg-foreground/90 text-sm"
          >
            Book Now
          </button>
        </div>
      </div>
    </div>
  )
}
