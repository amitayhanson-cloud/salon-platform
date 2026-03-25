import CalenoLoading from "@/components/CalenoLoading";

export default function MainSegmentLoading() {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-white"
      dir="ltr"
      aria-busy="true"
      aria-label="Loading"
    >
      <CalenoLoading />
    </div>
  );
}
