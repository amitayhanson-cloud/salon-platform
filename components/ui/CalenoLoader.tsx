"use client";

/**
 * Caleno logo loading animation: expand + gentle pulse on the logo, three fading dots below.
 * Use in loading states (e.g. full-screen or inline).
 *
 * Example:
 *   <div className="flex items-center justify-center h-screen">
 *     <CalenoLoader />
 *   </div>
 */
export default function CalenoLoader() {
  const clipId = "caleno-loader-clip";

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="relative w-20 h-20">
        <svg
          className="caleno-loader-anim-svg w-full h-full origin-center"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1500 1500"
          aria-hidden
        >
          <defs>
            <clipPath id={clipId}>
              <path d="M 0 0 L 1500 0 L 1500 1463.117188 L 0 1463.117188 Z" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <path
              className="caleno-loader-anim-path origin-center"
              fill="#4dd4d4"
              d="M 511.09375 205.265625 C 328.132812 205.265625 179.378906 354.019531 179.378906 536.976562 L 179.378906 929.140625 C 179.378906 1112.097656 328.132812 1260.851562 511.09375 1260.851562 L 990.113281 1260.851562 C 1173.070312 1260.851562 1321.824219 1112.097656 1321.824219 929.140625 L 1321.824219 733.058594 C 1321.824219 550.101562 1173.070312 401.347656 990.113281 401.347656 L 511.09375 401.347656 C 419.933594 401.347656 343.464844 477.816406 343.464844 568.976562 L 343.464844 897.140625 C 343.464844 988.300781 419.933594 1064.769531 511.09375 1064.769531 L 958.113281 1064.769531 C 1031.605469 1064.769531 1091.746094 1004.625 1091.746094 931.136719 L 1091.746094 765.058594 C 1091.746094 691.566406 1031.605469 631.425781 958.113281 631.425781 L 543.09375 631.425781 Z"
            />
          </g>
        </svg>
      </div>
      <div className="caleno-loader-dots">
        <span className="caleno-loader-dot" aria-hidden />
        <span className="caleno-loader-dot" aria-hidden />
        <span className="caleno-loader-dot" aria-hidden />
      </div>
    </div>
  );
}
