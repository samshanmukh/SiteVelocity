import { checkProviderConnections } from "@/lib/providers/registry";

// Provider readiness remains on `/` for now. Segment 8 will own the public
// landing at `/`. Alpha product entry is `/command-center` under app/(product).

export const dynamic = "force-dynamic";

const labels = {
  connected: "Connected",
  configured: "Configured",
  unconfigured: "Needs credentials",
  error: "Connection failed",
} as const;

export default async function Home() {
  const providers = await checkProviderConnections();

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">SITEVELOCITY / ALPHA</p>
        <h1>Find the sites that can move.</h1>
        <p className="lede">
          The application shell is live. Core providers remain server-side and report their real connection state.
        </p>
      </header>

      <section aria-labelledby="provider-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OPERATING SYSTEM</p>
            <h2 id="provider-heading">Provider readiness</h2>
          </div>
          <a href="/api/integrations">JSON diagnostics</a>
        </div>

        <div className="grid">
          {providers.map((provider) => (
            <article className="card" key={provider.id}>
              <div className="card-header">
                <h3>{provider.name}</h3>
                <span className={`status status-${provider.status}`}>{labels[provider.status]}</span>
              </div>
              <p>{provider.message}</p>
              {provider.latencyMs !== undefined ? <small>{provider.latencyMs} ms probe</small> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="next-step" aria-labelledby="next-heading">
        <p className="eyebrow">NEXT BEST ACTION</p>
        <h2 id="next-heading">Add server-side credentials, then run the live connection checks.</h2>
        <p>
          Render, Rtrvr, MiniMax, and Supabase are isolated behind internal provider contracts. Missing optional services cannot break the core application.
        </p>
      </section>
    </main>
  );
}
