export default function Home() {
  return (
    <main className="relative min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="items-center mx-auto flex w-full max-w-7xl justify-between px-6 py-4 md:px-10">
          <span className="text-4xl font-bold text-[#0e5a2a]">helpr</span>
          <div className="flex items-center gap-4 md:gap-8">
          <a href="#" className="text-md font-bold text-slate-1000">Download</a>
          <a href="#" className="rounded-lg border-1 text-[#0e5a2a] text-md font-bold px-5 py-2 ">Become a Pro</a>
          </div>
        </div>
      </header>
      <section>
        <div className="mx-auto flex w-full max-w-7xl items-center px-6 py-16 md:px-10">
          <div className="w-1/2">
            <img src="/images/graphic_placeholder.png" alt="App Mockup" className="w-full" />
          </div>
          <div className="w-1/2">
            <span className="text-4xl font-bold text-slate-900">Flat rates. <span className="text-[#0e5a2a]">Low fees.</span><br /> Instant booking.</span>
          </div>
        </div>
      </section>
    </main>
  );
}