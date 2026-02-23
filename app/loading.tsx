import CalenoLoading from "@/components/CalenoLoading";

export default function Loading() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)",
      }}
    >
      <CalenoLoading />
    </div>
  );
}
