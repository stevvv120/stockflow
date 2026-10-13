# Entity Relationship Diagram

```mermaid
erDiagram
    categories ||--o{ products : "memiliki"
    users ||--o{ sales : "mencatat"
    users ||--o{ stock_movements : "melakukan"
    products ||--o{ stock_movements : "punya riwayat"
    products ||--o{ sale_items : "terjual di"
    sales ||--|{ sale_items : "berisi"

    users {
        int id PK
        varchar name
        varchar email UK
        varchar password_hash
        enum role "admin | staff"
    }
    categories {
        int id PK
        varchar name UK
    }
    products {
        int id PK
        int category_id FK
        varchar sku UK
        varchar name
        decimal cost_price
        decimal selling_price
        int stock
        int minimum_stock
    }
    sales {
        int id PK
        varchar invoice_number UK
        int user_id FK
        decimal total_amount
        timestamp created_at
    }
    sale_items {
        int id PK
        int sale_id FK
        int product_id FK
        int quantity
        decimal unit_price
        decimal unit_cost
        decimal subtotal
    }
    stock_movements {
        int id PK
        int product_id FK
        int user_id FK
        enum movement_type "initial | in | out | adjustment"
        int quantity "bertanda: + masuk, - keluar"
        int reference_id "id penjualan (jika out)"
        varchar note
        timestamp created_at
    }
```

## Keputusan desain

- `unit_price` dan `unit_cost` di `sale_items` adalah salinan harga saat transaksi, sehingga laporan lama tidak berubah saat harga produk diubah.
- `stock_movements` mencatat alasan setiap perubahan stok, bukan hanya angka akhirnya.
- Produk yang sudah punya riwayat tidak bisa dihapus (dilindungi foreign key).