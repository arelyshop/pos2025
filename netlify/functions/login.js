/*
 * =================================================================
 * ARCHIVO: /netlify/functions/login.js
 * Descripción: Maneja la autenticación de usuarios.
 * =================================================================
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Configuración de la conexión a la base de datos usando la variable de entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  // Solo permitir peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { username, password } = JSON.parse(event.body);

    if (!username || !password) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Usuario y contraseña son requeridos.' }) };
    }
    
    // ======================= INICIO DE LA MODIFICACIÓN =======================
    // Se añade un usuario "admin" por defecto para facilitar el acceso durante el desarrollo.
    // IMPORTANTE: Para un entorno de producción, se recomienda eliminar este bloque y gestionar
    // todos los usuarios a través de la base de datos con contraseñas seguras.
    if (username === 'admin' && password === 'admin') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: 'success',
          user: {
            username: 'admin',
            fullName: 'Administrador del Sistema',
          }
        }),
      };
    }
    // ======================== FIN DE LA MODIFICACIÓN =========================

    // La lógica existente para buscar usuarios en la base de datos se mantiene.
    const { rows } = await pool.query('SELECT username, full_name, password_hash FROM users WHERE username = $1', [username]);

    if (rows.length === 0) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Usuario o contraseña incorrectos.' }) };
    }

    const user = rows[0];
    
    // Comparar la contraseña enviada con el hash almacenado
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Usuario o contraseña incorrectos.' }) };
    }

    // Devolver datos del usuario (sin la contraseña)
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'success',
        user: {
          username: user.username,
          fullName: user.full_name,
        }
      }),
    };
  } catch (error) {
    console.error('Error en la función de login:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Error interno del servidor.' }) };
  }
};

/*
 * =================================================================
 * ARCHIVO: /netlify/functions/get-products.js
 * Descripción: Obtiene todos los productos de la base de datos.
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  try {
    // Renombrar columnas en la consulta SQL para que coincidan con el frontend
    const { rows } = await pool.query(`
      SELECT 
        sku,
        nombre AS "Nombre",
        precio_venta AS "Precio (Venta)",
        precio_compra AS "Precio (Compra)",
        precio_mayoreo AS "Precio (Mayoreo)",
        cantidad AS "Cantidad",
        codigo_barras AS "Código de Barras",
        url_foto_1 AS "URL Foto 1"
      FROM products
    `);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', data: rows }),
    };
  } catch (error) {
    console.error('Error al obtener productos:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'No se pudieron cargar los productos.' }) };
  }
};


/*
 * =================================================================
 * ARCHIVO: /netlify/functions/get-sales.js
 * Descripción: Obtiene el historial de ventas.
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id AS "Nro. Venta",
        to_char(fecha_venta, 'DD/MM/YYYY') AS "Fecha de Venta",
        nombre_cliente AS "Nombre Cliente",
        contacto AS "Contacto",
        nit_ci AS "NIT/CI",
        total_venta AS "Total Venta",
        productos_vendidos AS "Productos Vendidos (JSON)",
        estado AS "Estado"
      FROM sales
      ORDER BY fecha_venta DESC
    `);
    
    // El frontend espera el JSON como un string, así que lo convertimos.
    const formattedRows = rows.map(row => ({
      ...row,
      "Productos Vendidos (JSON)": JSON.stringify(row["Productos Vendidos (JSON)"])
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', data: formattedRows }),
    };
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'No se pudieron cargar las ventas.' }) };
  }
};


/*
 * =================================================================
 * ARCHIVO: /netlify/functions/record-sale.js
 * Descripción: Registra una nueva venta y actualiza el stock.
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const client = await pool.connect();
  try {
    const { customer, items, total } = JSON.parse(event.body).data;

    await client.query('BEGIN'); // Iniciar transacción

    // 1. Generar un nuevo ID de venta
    const lastSaleResult = await client.query("SELECT id FROM sales ORDER BY fecha_venta DESC LIMIT 1");
    let nextIdNumber = 1;
    if (lastSaleResult.rows.length > 0) {
        const lastId = lastSaleResult.rows[0].id;
        const lastNumber = parseInt(lastId.replace('AS', ''), 10);
        if (!isNaN(lastNumber)) {
            nextIdNumber = lastNumber + 1;
        }
    }
    const saleId = `AS${nextIdNumber}`;

    // 2. Insertar la venta en la tabla 'sales'
    const saleQuery = `
      INSERT INTO sales (id, nombre_cliente, contacto, nit_ci, total_venta, productos_vendidos)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await client.query(saleQuery, [saleId, customer.name, customer.contact, customer.id, total, JSON.stringify(items)]);

    // 3. Actualizar el stock de cada producto
    for (const item of items) {
      await client.query(
        'UPDATE products SET cantidad = cantidad - $1 WHERE sku = $2',
        [item.cantidad, item.SKU]
      );
    }

    await client.query('COMMIT'); // Confirmar transacción

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', saleId: saleId, message: 'Venta registrada con éxito.' }),
    };
  } catch (error) {
    await client.query('ROLLBACK'); // Revertir en caso de error
    console.error('Error al registrar la venta:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Error interno al registrar la venta.' }) };
  } finally {
    client.release();
  }
};


/*
 * =================================================================
 * ARCHIVO: /netlify/functions/add-product.js
 * Descripción: Añade un nuevo producto al inventario.
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const p = JSON.parse(event.body).data;
    const query = `
      INSERT INTO products (sku, nombre, precio_venta, precio_compra, precio_mayoreo, cantidad, codigo_barras, url_foto_1)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await pool.query(query, [p.sku, p.nombre, p.precioVenta, p.precioCompra, p.precioMayoreo, p.cantidad, p.codigoBarras, p.urlFoto1]);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', message: 'Producto añadido con éxito.' }),
    };
  } catch (error) {
    console.error('Error al añadir producto:', error);
    // Manejar error de SKU duplicado
    if (error.code === '23505') {
        return { statusCode: 409, body: JSON.stringify({ status: 'error', message: 'El SKU ya existe.' }) };
    }
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Error interno al añadir el producto.' }) };
  }
};


/*
 * =================================================================
 * ARCHIVO: /netlify/functions/update-product.js
 * Descripción: Actualiza un producto existente.
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const p = JSON.parse(event.body).data;
    const query = `
      UPDATE products SET
        nombre = $1,
        precio_venta = $2,
        precio_compra = $3,
        precio_mayoreo = $4,
        cantidad = $5,
        codigo_barras = $6,
        url_foto_1 = $7,
        sku = $8
      WHERE sku = $9
    `;
    await pool.query(query, [p.nombre, p.precioVenta, p.precioCompra, p.precioMayoreo, p.cantidad, p.codigoBarras, p.urlFoto1, p.sku, p.originalSku]);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', message: 'Producto actualizado con éxito.' }),
    };
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Error interno al actualizar el producto.' }) };
  }
};


/*
 * =================================================================
 * ARCHIVO: /netlify/functions/annul-sale.js
 * Descripción: Anula una venta y restaura el stock.
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const client = await pool.connect();
  try {
    const { saleId } = JSON.parse(event.body).data;

    await client.query('BEGIN');

    // 1. Obtener los productos de la venta
    const saleResult = await client.query('SELECT productos_vendidos FROM sales WHERE id = $1', [saleId]);
    if (saleResult.rows.length === 0) {
      throw new Error('Venta no encontrada.');
    }
    const items = saleResult.rows[0].productos_vendidos;

    // 2. Restaurar el stock
    for (const item of items) {
      await client.query(
        'UPDATE products SET cantidad = cantidad + $1 WHERE sku = $2',
        [item.cantidad, item.SKU]
      );
    }

    // 3. Marcar la venta como anulada
    await client.query("UPDATE sales SET estado = 'Anulada' WHERE id = $1", [saleId]);

    await client.query('COMMIT');

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', message: `Venta ${saleId} anulada y stock restaurado.` }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al anular la venta:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Error interno al anular la venta.' }) };
  } finally {
    client.release();
  }
};
