import React, { useEffect, useState } from 'react';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Package, 
  ArrowUpDown 
} from 'lucide-react';
import { fetchInventory, fetchCategories } from '../api';

export default function InventoryView() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('product_name');
  const [sortDir, setSortDir] = useState('ASC');

  // Load Categories once
  useEffect(() => {
    fetchCategories()
      .then(res => setCategories(res.categories || []))
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  // Load Inventory data
  const loadInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInventory({
        search: searchTerm,
        category: selectedCategory,
        status: selectedStatus,
        sortBy,
        sortDir
      });
      setItems(data.items || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      loadInventory();
    }, 200); // Debounce search
    return () => clearTimeout(handler);
  }, [searchTerm, selectedCategory, selectedStatus, sortBy, sortDir]);

  return (
    <div>
      {/* Inventory Summary Bar */}
      {summary && (
        <div style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap'
        }}>
          <div className="badge badge-neutral" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Total Items: <strong>{items.length}</strong>
          </div>
          <div className="badge badge-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Total Physical Units: <strong>{summary.totalUnits?.toLocaleString()}</strong>
          </div>
          <div className="badge badge-neutral" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Inventory Valuation: <strong>₹{summary.totalValuation?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
          {summary.lowStockCount > 0 && (
            <div className="badge badge-warning" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              <AlertTriangle size={13} />
              Low Stock Alerts: <strong>{summary.lowStockCount}</strong>
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by title, ISBN, or format..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <select
            className="select-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            className="select-filter"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Stock Levels</option>
            <option value="LOW_STOCK">Low Stock Only (≤ Min Threshold)</option>
            <option value="HEALTHY">Healthy Stock Only</option>
          </select>

          <select
            className="select-filter"
            value={`${sortBy}_${sortDir}`}
            onChange={(e) => {
              const [col, dir] = e.target.value.split('_');
              setSortBy(col);
              setSortDir(dir);
            }}
          >
            <option value="product_name_ASC">Sort by Title (A-Z)</option>
            <option value="product_name_DESC">Sort by Title (Z-A)</option>
            <option value="quantity_on_hand_ASC">Sort by QOH (Lowest first)</option>
            <option value="quantity_on_hand_DESC">Sort by QOH (Highest first)</option>
            <option value="selling_price_DESC">Sort by Price (Highest first)</option>
            <option value="selling_price_ASC">Sort by Price (Lowest first)</option>
          </select>

          <button 
            onClick={loadInventory} 
            className="btn btn-outline"
            title="Refresh Inventory"
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="table-container">
        {loading && items.length === 0 ? (
          <div className="state-box">
            <div className="spinner" />
            <p>Loading live inventory catalog...</p>
          </div>
        ) : error ? (
          <div className="state-box error">
            <AlertTriangle size={32} />
            <p>{error}</p>
            <button onClick={loadInventory} className="btn btn-primary" style={{ marginTop: 12 }}>
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="state-box">
            <Package size={36} color="var(--text-muted)" />
            <p>No inventory records match the selected filters.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Book / Product Title</th>
                <th>Category</th>
                <th>Format</th>
                <th>ISBN</th>
                <th style={{ textAlign: 'right' }}>Cost Price</th>
                <th style={{ textAlign: 'right' }}>Selling Price</th>
                <th style={{ textAlign: 'center' }}>Min Level</th>
                <th style={{ textAlign: 'center' }}>Live Stock (QOH)</th>
                <th>Stock Status</th>
                <th style={{ textAlign: 'right' }}>Stock Valuation</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isLowStock = item.stock_status === 'LOW_STOCK';
                return (
                  <tr key={item.inventory_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {item.product_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {item.item_type} • Variant #{item.variant_id}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{item.category}</span>
                    </td>
                    <td>
                      <span className="badge badge-primary">{item.format}</span>
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {item.isbn}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono">
                      ₹{parseFloat(item.purchase_price || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className="font-mono">
                      ₹{parseFloat(item.selling_price || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      {item.minimum_stock}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: isLowStock ? 'var(--warning)' : 'var(--text-main)'
                      }}>
                        {item.quantity_on_hand}
                      </span>
                    </td>
                    <td>
                      {isLowStock ? (
                        <span className="badge badge-warning" title="Stock at or below minimum reorder point">
                          <AlertTriangle size={11} /> Low Stock
                        </span>
                      ) : (
                        <span className="badge badge-success" title="Healthy inventory buffer">
                          <CheckCircle size={11} /> Healthy
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className="font-mono">
                      ₹{parseFloat(item.stock_valuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
