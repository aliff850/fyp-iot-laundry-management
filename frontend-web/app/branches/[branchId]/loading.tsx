export default function BranchRouteLoading() {
  return (
    <div
      role="status"
      aria-label="Loading branch workspace"
      className="flex min-h-screen flex-col bg-canvas font-sans text-sm leading-normal text-ink scheme-dark"
    >
      <header className="fixed inset-x-0 top-0 z-30 border-b border-line bg-navy">
        <div className="mx-auto flex min-h-16 w-full max-w-360 items-center justify-between gap-4 px-4 md:min-h-19 md:px-6 xl:px-10">
          <div className="flex min-w-0 items-center gap-6 md:gap-8">
            <div className="h-7 w-28 animate-pulse rounded-md bg-navy-selected" />
            <div className="hidden h-7 w-40 animate-pulse rounded-md bg-navy-hover sm:block" />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="size-11 animate-pulse rounded-md bg-navy-hover" />
            <div className="hidden h-11 w-24 animate-pulse rounded-md bg-navy-hover md:block" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-360 flex-1 px-4 pt-22 pb-24 md:px-6 md:pt-28 md:pb-10 xl:px-10">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-28 animate-pulse rounded bg-raised" />
        </div>

        <div className="space-y-6 md:space-y-8">
          <div className="flex items-center gap-2">
            <div className="h-4 w-36 animate-pulse rounded bg-raised" />
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <aside className="flex w-full shrink-0 flex-col gap-2 rounded-md border border-line bg-surface p-2.5 md:w-56">
              <div className="h-8 w-full animate-pulse rounded bg-raised" />
              <div className="hidden flex-col gap-1.5 md:flex">
                <div className="h-10 w-full animate-pulse rounded-md bg-raised" />
                <div className="h-10 w-full animate-pulse rounded-md bg-raised" />
                <div className="h-10 w-full animate-pulse rounded-md bg-raised" />
                <div className="h-10 w-full animate-pulse rounded-md bg-raised" />
              </div>
            </aside>

            <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
              <section className="rounded-md border border-line bg-surface p-5 md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="h-7 w-48 animate-pulse rounded bg-raised" />
                    <div className="h-4 w-64 max-w-full animate-pulse rounded bg-raised" />
                  </div>
                  <div className="h-5 w-40 animate-pulse rounded bg-raised" />
                </div>
              </section>

              <section className="rounded-md border border-line bg-surface p-5 md:p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="h-24 animate-pulse rounded-md border border-rule bg-raised" />
                  <div className="h-24 animate-pulse rounded-md border border-rule bg-raised" />
                  <div className="h-24 animate-pulse rounded-md border border-rule bg-raised" />
                </div>
              </section>

              <section className="rounded-md border border-line bg-surface p-5 md:p-6">
                <div className="h-64 w-full animate-pulse rounded-md border border-rule bg-raised" />
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
