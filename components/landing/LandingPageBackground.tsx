/**
 * Same stationary radial gradient as the home landing page (fixed, behind content).
 */
export function LandingPageBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 100% 100% at 50% 50%, #cceef1 0%, #e6f5f7 25%, #f0f9fa 50%, #f8fcfd 75%, #ffffff 100%)",
      }}
    />
  );
}
