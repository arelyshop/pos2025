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
