export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <section className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-600">
          Welcome
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Build something great.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          A simple, welcoming starting point for your next project.
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="/assistant"
            className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
          >
            Look at Our Agent
          </a>
          <a
            href="dashboard"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium transition hover:bg-slate-100"
          >
            View Dashboard
          </a>
        </div>
      </section>
    </main>
  )
}