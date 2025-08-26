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
