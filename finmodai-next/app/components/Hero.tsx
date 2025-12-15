"use client";

import { useEffect, useState } from "react";

const skylines = [
  { src: "/skyline-nyc.jpg", label: "New York City" },
  { src: "/skyline-boston.jpg", label: "Boston" },
  { src: "/skyline-sf.jpg", label: "San Francisco" },
  { src: "/skyline-atlanta.jpg", label: "Atlanta" },
];

export default function Hero() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % skylines.length);
    }, 8000);
    return () => clearInterval(id);
  }, []);

  const currentCity = skylines[index]?.label;

  return (
    <section className="relative h-[90vh] w-full overflow-hidden bg-slate-900">
      <div className="absolute inset-0">
        {skylines.map((skyline, i) => (
          <div
            key={skyline.src}
            className={`absolute inset-0 transition-opacity duration-1000 ease-out ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
            style={{
              backgroundImage: `url(${skyline.src})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/75 to-black/90" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <p className="text-xs uppercase tracking-[0.5em] text-white/60">CapitalBase</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Institutional models in <span className="text-green-400">minutes</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-white/85 sm:text-base md:text-lg">
          Build banker-grade DCF, LBO, Comps, and 3-statement models powered by the same
          infrastructure used by global private equity teams.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/models/create"
            className="rounded-md bg-green-600 px-6 py-3 text-sm font-medium tracking-wide text-white transition hover:bg-green-500"
          >
            Launch Model Builder
          </a>
          <a
            href="/about"
            className="rounded-md border border-white/35 px-6 py-3 text-sm font-medium tracking-wide text-white/90 transition hover:bg-white/10"
          >
            Learn More
          </a>
        </div>

        {currentCity && (
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-white/60">{currentCity}</p>
        )}
      </div>
    </section>
  );
}
