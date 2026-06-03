import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database.types'
import { Plus, Pencil, Trash2, LogOut, X } from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    section: '',
    is_available: true,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setProducts(data)
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function resetForm() {
    setFormData({
      name: '',
      description: '',
      price: '',
      section: '',
      is_available: true,
    })
    setImageFile(null)
    setEditingProduct(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    let image_url = editingProduct?.image_url || ''

    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const { data } = await supabase.storage
        .from('product-images')
        .upload(fileName, imageFile)

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName)
        image_url = publicUrl
      }
    }

    const productData = {
      name: formData.name,
      description: formData.description || null,
      price: parseFloat(formData.price),
      section: formData.section,
      is_available: formData.is_available,
      image_url: image_url || null,
    }

    if (editingProduct) {
      await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id)
    } else {
      await supabase
        .from('products')
        .insert([productData])
    }

    resetForm()
    setIsModalOpen(false)
    fetchProducts()
  }

  async function deleteProduct(id: string) {
    if (confirm('Are you sure you want to delete this product?')) {
      await supabase.from('products').delete().eq('id', id)
      fetchProducts()
    }
  }

  async function toggleAvailability(product: Product) {
    await supabase
      .from('products')
      .update({ is_available: !product.is_available })
      .eq('id', product.id)
    fetchProducts()
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          <div className="flex gap-4">
            <button
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition"
            >
              <Plus size={20} /> Add Product
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition"
            >
              <LogOut size={20} /> Logout
            </button>
          </div>
        </div>

        {loading && products.length === 0 ? (
          <div className="text-center py-12">Loading products...</div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="h-10 w-10 object-cover rounded-md" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-200 rounded-md flex items-center justify-center">
                          <X size={20} className="text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.section}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${product.price.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => toggleAvailability(product)}
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          product.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {product.is_available ? 'Available' : 'Unavailable'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setEditingProduct(product)
                          setFormData({
                            name: product.name,
                            description: product.description || '',
                            price: product.price.toString(),
                            section: product.section,
                            is_available: product.is_available,
                          })
                          setIsModalOpen(true)
                        }}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => deleteProduct(product.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Section</label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      placeholder="e.g. Electronics"
                      value={formData.section}
                      onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_available"
                    checked={formData.is_available}
                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                  />
                  <label htmlFor="is_available" className="text-sm font-medium text-gray-700">Available for sale</label>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); resetForm(); }}
                    className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                  >
                    {editingProduct ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
