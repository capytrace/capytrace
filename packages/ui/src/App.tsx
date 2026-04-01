import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchBar } from './components/SearchBar.tsx'
import { SearchResults } from './components/SearchResults.tsx'
import { ServiceStatus } from './components/ServiceStatus.tsx'
import { SyncButton } from './components/SyncButton.tsx'
import { useSearch } from './hooks/useSearch.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
})

function SearchPage() {
  const [query, setQuery] = useState('')
  const [sourceType, setSourceType] = useState<string | undefined>(undefined)

  const { results, total, took, isLoading, isFetching, error } = useSearch(
    query,
    sourceType !== undefined ? { sourceType } : undefined,
  )

  return (
    <div className="flex flex-col min-h-screen bg-[#0f0f11]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-800/60 bg-[#0f0f11]/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="CapyTrace" className="h-16 w-16 object-contain" />
            <span className="font-bold text-white text-lg tracking-tight">CapyTrace</span>
          </div>
          <div className="flex items-center gap-4">
            <ServiceStatus />
            <SyncButton />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 px-4">
        <div className="max-w-3xl mx-auto pt-16 pb-24">
          {/* Hero heading (shown when no search yet) */}
          {query.length < 2 && (
            <div className="text-center mb-10">
              <img src="/logo.png" alt="CapyTrace" className="h-56 w-56 object-contain mx-auto mb-4" />
              <h1 className="text-4xl font-bold text-white mb-3">
                Search your workspace
              </h1>
              <p className="text-gray-500 text-base">
                Slack, GitHub, and Google Drive — all in one place
              </p>
            </div>
          )}

          <SearchBar
            onSearch={(q) => setQuery(q)}
            onFilterChange={(st) => setSourceType(st)}
            isLoading={isFetching}
          />

          <SearchResults
            results={results}
            total={total}
            took={took}
            isLoading={isLoading}
            error={error}
            hasSearched={query.length >= 2}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-4 text-center">
        <p className="text-xs text-gray-600">
          CapyTrace · Open Source · MIT License
        </p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SearchPage />
    </QueryClientProvider>
  )
}
