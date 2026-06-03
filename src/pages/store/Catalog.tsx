import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database.types'
import { Search, Filter } from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [selectedSection, setSelectedSection] = useState<string>('All')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_available', true)
      .order('created_at', { ascending: false })

    if (data) {
      setProducts(data as Product[])
      const uniqueSections = ['All', ...new Set((data as Product[]).map(p => p.section))]
      setSections(uniqueSections)
    }
    setLoading(false)
  }

  const filteredProducts = products.filter(product => {
    const matchesSection = selectedSection === 'All' || product.section === selectedSection
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    return matchesSection && matchesSearch
  })

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="bg-gray-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">MarksonGlobal Store</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <Filter size={20} className="text-gray-500 hidden md:block" />
            {sections.map(section => (
              <button
                key={section}
                onClick={() => setSelectedSection(section)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  selectedSection === section
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {section}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No products found matching your criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredProducts.map(product => (
              <div key={product.id} className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
                <div className="aspect-square relative overflow-hidden bg-gray-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No image
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className="bg-white/90 backdrop-blur-sm text-indigo-600 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded">
                      {product.section}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{product.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3 h-10">{product.description}</p>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-xl font-bold text-indigo-600">${product.price.toFixed(2)}</span>
                    <button className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="bg-gray-50 border-t border-gray-200 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          &copy; 2026 MarksonGlobal. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
