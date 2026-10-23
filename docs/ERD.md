# Entity Relationship Diagram

```mermaid
erDiagram
    categories ||--o{ products : "memiliki"
    warehouses ||--o{ warehouse_stocks : "menyimpan"
    products ||--o{ warehouse_stocks : "saldo per gudang"
    warehouses ||--o{ stock_movements : "pergerakan di"
    users ||--o{ sales : "mencatat"
    users ||--o{ stock_movements : "melakukan"
    products ||--o{ stock_movements : "punya riwayat"
    warehouses ||--o{ sales : "transaksi dari"
    products ||--o{ sale_items : "terjual di"
    sales ||--|{ sale_items : "berisi"
    suppliers ||--o{ purchase_orders : "menerima PO"
    warehouses ||--o{ purchase_orders : "tujuan penerimaan"
    purchase_orders ||--|{ purchase_order_items : "berisi"
    products ||--o{ purchase_order_items : "dipesan"
    warehouses ||--o{ customer_orders : "memenuhi pesanan"
    customer_orders ||--|{ customer_order_items : "berisi"
    products ||--o{ customer_order_items : "dipesan"
    sales o|--o| customer_orders : "invoice saat dikirim"
    customer_orders ||--o| shipments : "dikirim sebagai"
    shipments ||--o{ shipment_events : "riwayat status"
    users ||--o{ shipment_events : "mencatat status"
    users ||--o{ purchase_orders : "membuat/menyetujui"
    users ||--o{ customer_orders : "membuat/menyetujui"
    users o|--o{ audit_logs : "aktivitas"

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
        int stock "agregat lintas gudang untuk kompatibilitas"
    }
    warehouses {
        int id PK
        varchar code UK
        varchar name
        varchar address
        boolean is_default
        boolean is_active
    }
    warehouse_stocks {
        int warehouse_id PK, FK
        int product_id PK, FK
        int on_hand
        int reserved
    }
    sales {
        int id PK
        varchar invoice_number UK
        int user_id FK
        int warehouse_id FK
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
        int warehouse_id FK
        int product_id FK
        int user_id FK
        enum movement_type "initial | in | out | adjustment"
        int quantity "bertanda: + masuk, - keluar"
        int reference_id "id penjualan (jika out)"
        varchar note
        timestamp created_at
    }
    suppliers {
        int id PK
        varchar name
        varchar email
        varchar phone
        varchar address
        boolean is_active
    }
    purchase_orders {
        int id PK
        varchar order_number UK
        int supplier_id FK
        int warehouse_id FK
        enum status "draft | pending_approval | approved | rejected | partially_received | received | cancelled"
        int created_by FK
        int approved_by FK
        timestamp created_at
        timestamp approved_at
        timestamp received_at
    }
    purchase_order_items {
        int id PK
        int purchase_order_id FK
        int product_id FK
        int quantity
        int received_quantity
        decimal unit_cost
    }
    customer_orders {
        int id PK
        varchar order_number UK
        int warehouse_id FK
        int sale_id FK
        enum status "draft | pending_approval | approved | rejected | cancelled | fulfilled"
        int created_by FK
        int approved_by FK
        timestamp created_at
        timestamp approved_at
    }
    customer_order_items {
        int id PK
        int customer_order_id FK
        int product_id FK
        int quantity
        decimal unit_price
        decimal unit_cost
    }
    shipments {
        int id PK
        int customer_order_id FK
        enum status "pending | shipped | in_transit | delivered | cancelled"
        varchar tracking_number
        timestamp shipped_at
        timestamp delivered_at
    }
    shipment_events {
        int id PK
        int shipment_id FK
        int user_id FK
        enum status
        varchar note
        timestamp created_at
    }
    audit_logs {
        bigint id PK
        int user_id FK
        varchar action
        varchar entity_type
        bigint entity_id
        json details
        timestamp created_at
    }
```

## Keputusan desain

- `unit_price` dan `unit_cost` di `sale_items` adalah salinan harga saat transaksi, sehingga laporan lama tidak berubah saat harga produk diubah.
- `stock_movements` mencatat alasan setiap perubahan stok, bukan hanya angka akhirnya.
- Produk yang sudah punya riwayat tidak bisa dihapus (dilindungi foreign key).
- `warehouse_stocks` menyimpan saldo fisik dan reservasi per produk/gudang. Stok yang dapat dijual/dipesan adalah `on_hand - reserved`.
- `products.stock` adalah agregat lintas gudang untuk kompatibilitas dengan fitur katalog dan laporan yang sudah ada. Penulisan stok dilakukan bersamaan dengan saldo gudang dalam transaksi.
- Penerimaan PO menambah stok hanya saat barang benar-benar diterima. Pesanan pelanggan menahan stok tersedia; saat shipment menjadi `shipped`, stok fisik dikurangi dan invoice penjualan dibuat.
- Migrasi `database/migrations/001_business_workflows.sql` membuat gudang `MAIN` dan mengalokasikan saldo stok lama ke gudang itu. Jalankan satu kali setelah backup database.