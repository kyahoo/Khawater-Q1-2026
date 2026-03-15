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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get("name") || "ТУРНИР";
  const prize = params.get("prize") || "";
  const dates = params.get("dates") || "";
  const logoUrl = params.get("logoUrl") || "";
  const bgUrl = params.get("bgUrl") || "";

  return new ImageResponse(
    (
      <div
        tw="flex w-full h-full relative"
        style={{
          background: `linear-gradient(170deg, ${NAVY} 0%, #0B3A4A 50%, ${NAVY} 100%)`,
        }}
      >
        {bgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgUrl}
            alt=""
            tw="absolute top-0 left-0 w-full h-full"
            style={{ objectFit: "cover" }}
          />
        ) : null}

        {/* Dark overlay for contrast — always rendered, stronger when bg image is present */}
        <div
          tw="absolute top-0 left-0 w-full h-full flex"
          style={{
            background: bgUrl
              ? "rgba(0, 0, 0, 0.45)"
              : "radial-gradient(ellipse 80% 40% at 50% 30%, rgba(205, 156, 62, 0.08) 0%, transparent 70%)",
          }}
        />

        <div tw="flex flex-col w-full h-full relative">
          {/* Corner accents */}
          <div
            tw="absolute flex"
            style={{
              top: 48,
              left: 48,
              width: 100,
              height: 100,
              borderTop: `6px solid ${GOLD}`,
              borderLeft: `6px solid ${GOLD}`,
            }}
          />
          <div
            tw="absolute flex"
            style={{
              top: 48,
              right: 48,
              width: 100,
              height: 100,
              borderTop: `6px solid ${GOLD}`,
              borderRight: `6px solid ${GOLD}`,
            }}
          />
          <div
            tw="absolute flex"
            style={{
              bottom: 48,
              left: 48,
              width: 100,
              height: 100,
              borderBottom: `6px solid ${GOLD}`,
              borderLeft: `6px solid ${GOLD}`,
            }}
          />
          <div
            tw="absolute flex"
            style={{
              bottom: 48,
              right: 48,
              width: 100,
              height: 100,
              borderBottom: `6px solid ${GOLD}`,
              borderRight: `6px solid ${GOLD}`,
            }}
          />

          <div
            tw="flex flex-col items-center w-full h-full px-20"
            style={{
              paddingTop: 120,
              paddingBottom: 120,
              justifyContent: "space-between",
            }}
          >
            {/* Top: label */}
            <div
              tw="flex items-center justify-center px-14 py-5"
              style={{ backgroundColor: GOLD }}
            >
              <span
                style={{
                  color: NAVY,
                  fontSize: 36,
                  fontWeight: 900,
                  letterSpacing: 12,
                  textTransform: "uppercase",
                }}
              >
                АНОНС ТУРНИРА
              </span>
            </div>

            {/* Center: logo (hero) — or fallback name text if no logo */}
            {logoUrl ? (
              <div tw="flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt=""
                  width={480}
                  height={480}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : (
              <div
                tw="flex items-center justify-center border-4 px-14 py-10"
                style={{
                  borderColor: GOLD,
                  backgroundColor: "rgba(6, 23, 38, 0.85)",
                  boxShadow: `12px 12px 0 ${NAVY}`,
                  maxWidth: 940,
                }}
              >
                <span
                  style={{
                    color: "#F4EED7",
                    fontSize: name.length > 20 ? 52 : 68,
                    fontWeight: 900,
                    letterSpacing: 4,
                    textAlign: "center",
                    textTransform: "uppercase",
                    lineHeight: 1.15,
                  }}
                >
                  {name}
                </span>
              </div>
            )}

            {/* Bottom: dates + prize stack */}
            <div
              tw="flex flex-col items-center"
              style={{ gap: 48 }}
            >
              {dates ? (
                <div
                  tw="flex items-center justify-center px-14 py-6"
                  style={{
                    backgroundColor: "rgba(11, 58, 74, 0.92)",
                    border: `3px solid rgba(205, 156, 62, 0.4)`,
                  }}
                >
                  <span
                    style={{
                      color: "#DCEAEF",
                      fontSize: 40,
                      fontWeight: 800,
                      letterSpacing: 5,
                      textTransform: "uppercase",
                    }}
                  >
                    {dates}
                  </span>
                </div>
              ) : null}

              {prize ? (
                <div
                  tw="flex flex-col items-center"
                  style={{ gap: 16 }}
                >
                  <span
                    style={{
                      color: GOLD,
                      fontSize: 32,
                      fontWeight: 900,
                      letterSpacing: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    ПРИЗОВОЙ ФОНД
                  </span>
                  <div
                    tw="flex items-center justify-center border-4 px-16 py-8"
                    style={{
                      borderColor: GOLD,
                      backgroundColor: NAVY,
                      boxShadow: `10px 10px 0 rgba(205, 156, 62, 0.25)`,
                    }}
                  >
                    <span
                      style={{
                        color: GOLD,
                        fontSize: prize.length > 15 ? 60 : 80,
                        fontWeight: 900,
                        letterSpacing: 3,
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
      </div>
    ),
    size
  );
}
