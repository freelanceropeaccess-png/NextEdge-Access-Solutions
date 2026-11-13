import { renderHomepage } from "@/lib/homepage";

const publicPages = {
  home: {
    section: "hero",
    title: "NextEdge Access Solutions | Rope Access Philippines",
    description: "NextEdge Access Solutions provides rope access, work-at-height, inspection, maintenance, training, and PPE solutions across the Philippines.",
  },
  about: {
    section: "about",
    title: "About NEAS | NextEdge Access Solutions",
    description: "Learn about NextEdge Access Solutions and our approach to safe, reliable rope access and industrial services.",
  },
  services: {
    section: "services",
    title: "Rope Access & Industrial Services | NEAS",
    description: "Explore NEAS rope access, renewable energy, wind turbine, offshore, onshore, telecom, and industrial service capabilities.",
  },
  partners: {
    section: "partners",
    title: "NEAS Partners | NextEdge Access Solutions",
    description: "Learn about the partner network and industry collaborations supporting NextEdge Access Solutions.",
  },
  contact: {
    section: "contact",
    title: "Contact NEAS | NextEdge Access Solutions",
    description: "Contact NEAS to discuss rope access, wind turbine, renewable energy, industrial maintenance, training, and project enquiries.",
  },
} as const;

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const page = publicPages[slug as keyof typeof publicPages];

  if (!page) {
    return new Response("Not Found", { status: 404 });
  }

  let html = await renderHomepage();
  const currentCanonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  let origin = "https://www.nextedge-access-solutions.com";
  try {
    if (currentCanonical) origin = new URL(currentCanonical).origin;
  } catch {
    // Keep the verified NEAS website origin when the configured canonical is invalid.
  }

  const canonical = `${origin}/${slug}`;
  html = html
    .replace(/<title>[\\s\\S]*?<\\/title>/, `<title>${page.title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${page.description}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${page.title}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${page.description}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);

  const section = JSON.stringify(page.section);
  const scrollScript = `<script>(function(){var id=${section};function scrollToSection(){var el=document.getElementById(id);if(!el)return;var top=el.getBoundingClientRect().top+window.scrollY-76;window.scrollTo({top:Math.max(0,top),behavior:"auto"});}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",scrollToSection,{once:true});}else{requestAnimationFrame(scrollToSection);}})();</script>`;
  html = html.replace("</body>", `${scrollScript}</body>`);

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
