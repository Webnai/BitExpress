import Image from "next/image";

const FLAG_SOURCES = {
  Ghana: {
    1: "/Ghana1.png",
    2: "/ghana2.png",
  },
  Nigeria: {
    1: "/Nigeria1.png",
    2: "/Nigeria2.png",
  },
  Kenya: {
    1: "/Kenya1.png",
    2: "/Kenya2.png",
  },
  Togo: {
    1: "/Togo1.png",
    2: "/Togo2.png",
  },
} as const;

type SupportedCountry = keyof typeof FLAG_SOURCES;

interface CountryFlagProps {
  country: SupportedCountry;
  variant?: 1 | 2;
  size?: number;
  className?: string;
}

export default function CountryFlag({
  country,
  variant = 1,
  size = 24,
  className = "",
}: CountryFlagProps) {
  const src = FLAG_SOURCES[country][variant];

  return (
    <Image
      src={src}
      alt={`${country} flag`}
      width={size}
      height={size}
      className={className}
    />
  );
}