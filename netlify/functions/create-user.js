/*
 * =================================================================
 * ARCHIVO: netlify/functions/create-user.js
 * (Crea un nuevo archivo con este nombre y pega este código)
 * =================================================================
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { username, fullName, password } = JSON.parse(event.body);

    if (!username || !password || !fullName) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Todos los campos son requeridos.' }) };
    }

    // Hashear la contraseña antes de guardarla
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO users (username, full_name, password_hash)
      VALUES ($1, $2, $3)
    `;
    await pool.query(query, [username, fullName, passwordHash]);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', message: 'Usuario creado con éxito.' }),
    };
  } catch (error) {
    console.error('Error al crear usuario:', error);
    if (error.code === '23505') { // Error de violación de unicidad
        return { statusCode: 409, body: JSON.stringify({ status: 'error', message: 'El nombre de usuario ya existe.' }) };
    }
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Error interno al crear el usuario.' }) };
  }
};


/*
 * =================================================================
 * ARCHIVO: netlify/functions/get-users.js
 * (Crea un nuevo archivo con este nombre y pega este código)
 * =================================================================
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

exports.handler = async (event, context) => {
  try {
    // Seleccionamos solo los datos seguros, NUNCA la contraseña
    const { rows } = await pool.query('SELECT id, username, full_name FROM users ORDER BY id');

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', data: rows }),
    };
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'No se pudieron cargar los usuarios.' }) };
  }
};


/*
 * =================================================================
 * ARCHIVO: netlify/functions/delete-user.js
 * (Crea un nuevo archivo con este nombre y pega este código)
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
    const { id } = JSON.parse(event.body);

    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Se requiere el ID del usuario.' }) };
    }
    
    // Prevenir la eliminación del usuario 'admin' si existe
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (userResult.rows.length > 0 && userResult.rows[0].username === 'admin') {
        return { statusCode: 403, body: JSON.stringify({ status: 'error', message: 'No se puede eliminar al usuario administrador.' }) };
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', message: 'Usuario eliminado con éxito.' }),
    };
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Error interno al eliminar el usuario.' }) };
  }
};
