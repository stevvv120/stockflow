-- Run once against an existing StockFlow database after backing it up.
CREATE TABLE warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    address VARCHAR(255) NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO warehouses (code, name, is_default)
VALUES ('MAIN', 'Gudang Utama', TRUE);

CREATE TABLE warehouse_stocks (
    warehouse_id INT NOT NULL,
    product_id INT NOT NULL,
    on_hand INT NOT NULL DEFAULT 0,
    reserved INT NOT NULL DEFAULT 0,
    PRIMARY KEY (warehouse_id, product_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    CHECK (on_hand >= 0),
    CHECK (reserved >= 0),
    CHECK (reserved <= on_hand)
);

INSERT INTO warehouse_stocks (warehouse_id, product_id, on_hand)
SELECT (SELECT id FROM warehouses WHERE code = 'MAIN'), id, stock
FROM products;

ALTER TABLE stock_movements
    ADD COLUMN warehouse_id INT NULL,
    MODIFY movement_type ENUM('initial','in','out','adjustment','transfer') NOT NULL;

UPDATE stock_movements
SET warehouse_id = (SELECT id FROM warehouses WHERE code = 'MAIN');

ALTER TABLE stock_movements
    MODIFY warehouse_id INT NOT NULL,
    ADD CONSTRAINT fk_stock_movements_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

ALTER TABLE sales
    ADD COLUMN warehouse_id INT NULL;

UPDATE sales
SET warehouse_id = (SELECT id FROM warehouses WHERE code = 'MAIN');

ALTER TABLE sales
    MODIFY warehouse_id INT NOT NULL,
    ADD CONSTRAINT fk_sales_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

CREATE TABLE suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NULL,
    phone VARCHAR(50) NULL,
    address VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(40) NOT NULL UNIQUE,
    supplier_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    status ENUM('draft','pending_approval','approved','rejected','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
    notes VARCHAR(500) NULL,
    created_by INT NOT NULL,
    approved_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    received_at TIMESTAMP NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE purchase_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    received_quantity INT NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    CHECK (quantity > 0),
    CHECK (received_quantity >= 0),
    CHECK (received_quantity <= quantity),
    CHECK (unit_cost >= 0)
);

CREATE TABLE customer_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(40) NOT NULL UNIQUE,
    warehouse_id INT NOT NULL,
    sale_id INT NULL UNIQUE,
    status ENUM('draft','pending_approval','approved','rejected','cancelled','fulfilled') NOT NULL DEFAULT 'pending_approval',
    notes VARCHAR(500) NULL,
    created_by INT NOT NULL,
    approved_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE customer_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (customer_order_id) REFERENCES customer_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (unit_cost >= 0)
);

CREATE TABLE shipments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_order_id INT NOT NULL UNIQUE,
    status ENUM('pending','shipped','in_transit','delivered','cancelled') NOT NULL DEFAULT 'pending',
    tracking_number VARCHAR(100) NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    FOREIGN KEY (customer_order_id) REFERENCES customer_orders(id)
);

CREATE TABLE shipment_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shipment_id INT NOT NULL,
    status ENUM('pending','shipped','in_transit','delivered','cancelled') NOT NULL,
    note VARCHAR(500) NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT NULL,
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created_at (created_at)
);
