import CalenoLoading from "@/components/CalenoLoading";

export default function AdminSegmentLoading() {
  return (
    <div
      className="flex min-h-[50vh] w-full items-center justify-center"
      dir="rtl"
      aria-busy="true"
      aria-label="טוען"
    >
      <CalenoLoading />
    </div>
  );
}
