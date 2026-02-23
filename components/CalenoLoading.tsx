"use client";

/**
 * Full-page Caleno logo loading animation (C segments, progress ring, dots).
 * Used site-wide for route loading and auth/data loading states.
 */
export default function CalenoLoading() {
  return (
    <div className="caleno-loader-container">
      <div className="caleno-logo-loader">
        <svg
          className="caleno-progress-ring"
          viewBox="0 0 140 140"
          aria-hidden
        >
          <circle
            className="caleno-progress-ring-circle"
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="#1a9aaa"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="380"
            strokeDashoffset="380"
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
            }}
          />
        </svg>

        <svg
          className="caleno-c-segment caleno-c-outer"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M 50 10 C 72.1 10 90 27.9 90 50 C 90 72.1 72.1 90 50 90 C 27.9 90 10 72.1 10 50 C 10 27.9 27.9 10 50 10 Z M 50 25 C 50 25 30 25 30 50 C 30 75 50 75 50 75 L 50 90 C 27.9 90 10 72.1 10 50 C 10 27.9 27.9 10 50 10 C 72.1 10 90 27.9 90 50 L 75 50 C 75 35.9 62.1 25 50 25 Z"
            fill="#1a9aaa"
            opacity="0.9"
          />
        </svg>

        <svg
          className="caleno-c-segment caleno-c-middle"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M 50 20 C 66.6 20 80 33.4 80 50 C 80 66.6 66.6 80 50 80 L 50 60 C 56.6 60 65 56.6 65 50 C 65 43.4 56.6 35 50 35 C 43.4 35 35 43.4 35 50 C 35 56.6 43.4 65 50 65 L 50 80 C 33.4 80 20 66.6 20 50 C 20 33.4 33.4 20 50 20 Z"
            fill="#4dd4d4"
            opacity="0.8"
          />
        </svg>

        <svg
          className="caleno-c-segment caleno-c-inner"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M 50 30 C 61.1 30 70 38.9 70 50 C 70 61.1 61.1 70 50 70 C 50 70 50 60 50 50 C 50 50 55 50 55 50 C 55 45.8 52.8 42 50 42 C 47.2 42 45 45.8 45 50 C 45 54.2 47.2 58 50 58 L 50 70 C 38.9 70 30 61.1 30 50 C 30 38.9 38.9 30 50 30 Z"
            fill="#7ee7e7"
            opacity="0.7"
          />
        </svg>
      </div>

      <div className="caleno-loading-dots">
        <div className="caleno-dot" />
        <div className="caleno-dot" />
        <div className="caleno-dot" />
      </div>

      <div className="caleno-loading-text">LOADING</div>
    </div>
  );
}
