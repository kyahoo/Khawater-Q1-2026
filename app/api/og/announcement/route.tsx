import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Tournament announcement banner";
export const contentType = "image/png";
export const size = {
  width: 1080,
  height: 1440,
};

const GOLD = "#CD9C3E";
const NAVY = "#061726";
const CREAM = "#F4EED7";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get("name") || "ТУРНИР";
  const prize = params.get("prize") || "";
  const dates = params.get("dates") || "";
  const logoUrl = params.get("logoUrl") || "";

  return new ImageResponse(
    (
      <div
        tw="flex w-full h-full"
        style={{
          background: `linear-gradient(170deg, ${NAVY} 0%, #0B3A4A 50%, ${NAVY} 100%)`,
        }}
      >
        <div
          tw="flex flex-col w-full h-full relative"
          style={{
            background:
              "radial-gradient(ellipse 80% 40% at 50% 20%, rgba(205, 156, 62, 0.10) 0%, transparent 70%)",
          }}
        >
          {/* Decorative corner accents */}
          <div
            tw="absolute flex"
            style={{
              top: 40,
              left: 40,
              width: 80,
              height: 80,
              borderTop: `6px solid ${GOLD}`,
              borderLeft: `6px solid ${GOLD}`,
            }}
          />
          <div
            tw="absolute flex"
            style={{
              top: 40,
              right: 40,
              width: 80,
              height: 80,
              borderTop: `6px solid ${GOLD}`,
              borderRight: `6px solid ${GOLD}`,
            }}
          />
          <div
            tw="absolute flex"
            style={{
              bottom: 40,
              left: 40,
              width: 80,
              height: 80,
              borderBottom: `6px solid ${GOLD}`,
              borderLeft: `6px solid ${GOLD}`,
            }}
          />
          <div
            tw="absolute flex"
            style={{
              bottom: 40,
              right: 40,
              width: 80,
              height: 80,
              borderBottom: `6px solid ${GOLD}`,
              borderRight: `6px solid ${GOLD}`,
            }}
          />

          <div
            tw="flex flex-col items-center justify-center w-full h-full px-16"
            style={{ gap: 0 }}
          >
            {/* Top label */}
            <div
              tw="flex items-center justify-center px-10 py-3"
              style={{
                backgroundColor: GOLD,
                marginBottom: 48,
              }}
            >
              <span
                style={{
                  color: NAVY,
                  fontSize: 28,
                  fontWeight: 900,
                  letterSpacing: 8,
                  textTransform: "uppercase",
                }}
              >
                АНОНС ТУРНИРА
              </span>
            </div>

            {/* Logo */}
            {logoUrl ? (
              <div
                tw="flex items-center justify-center"
                style={{ marginBottom: 48 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt=""
                  width={240}
                  height={240}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : null}

            {/* Tournament name */}
            <div
              tw="flex items-center justify-center border-4 px-12 py-8"
              style={{
                borderColor: GOLD,
                backgroundColor: "rgba(6, 23, 38, 0.85)",
                boxShadow: `12px 12px 0 ${NAVY}`,
                maxWidth: 960,
              }}
            >
              <span
                style={{
                  color: CREAM,
                  fontSize: name.length > 20 ? 52 : 64,
                  fontWeight: 900,
                  letterSpacing: 3,
                  textAlign: "center",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                {name}
              </span>
            </div>

            {/* Dates */}
            {dates ? (
              <div
                tw="flex items-center justify-center px-8 py-4"
                style={{
                  marginTop: 40,
                  backgroundColor: "rgba(11, 58, 74, 0.9)",
                  border: `3px solid ${NAVY}`,
                }}
              >
                <span
                  style={{
                    color: "#BFD6DC",
                    fontSize: 34,
                    fontWeight: 800,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  {dates}
                </span>
              </div>
            ) : null}

            {/* Prize pool */}
            {prize ? (
              <div
                tw="flex flex-col items-center"
                style={{ marginTop: 56 }}
              >
                <span
                  style={{
                    color: GOLD,
                    fontSize: 26,
                    fontWeight: 900,
                    letterSpacing: 6,
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  ПРИЗОВОЙ ФОНД
                </span>
                <div
                  tw="flex items-center justify-center border-4 px-14 py-6"
                  style={{
                    borderColor: GOLD,
                    backgroundColor: NAVY,
                    boxShadow: `8px 8px 0 rgba(205, 156, 62, 0.3)`,
                  }}
                >
                  <span
                    style={{
                      color: GOLD,
                      fontSize: prize.length > 15 ? 56 : 72,
                      fontWeight: 900,
                      letterSpacing: 2,
                      textAlign: "center",
                    }}
                  >
                    {prize}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    size
  );
}
