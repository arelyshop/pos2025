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
