import 'reflect-metadata';
import Fastify from 'fastify';
import { http } from '@google-cloud/functions-framework';
import pkg from 'pg'
const { Pool } = pkg;

const server = Fastify();

// Create a connection pool
const pool = new Pool({
    connectionString: 'postgresql://task_manager_api_owner:RCJv5QXVt8By@ep-royal-flower-a15qzuwy-pooler.ap-southeast-1.aws.neon.tech/task_manager_api?sslmode=require',
});

// Middleware to attach the pool to the Fastify instance
server.decorate('pg', pool);

// Parse JSON body manually if required
server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
        done(null, JSON.parse(body));
    } catch (err) {
        done(err, undefined);
    }
});

// Example route to test the database connection
server.get('/', async (request, reply) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        return { message: 'Welcome to Task Manager API!', dbTime: result.rows[0].now };
    } catch (error) {
        console.error('Database query failed:', error);
        return reply.status(500).send({ error: 'Internal Server Error for db not connect' });
    }
});

// Create a new task
server.post('/tasks', async (request, reply) => {
    const { title, description, status } = request.body;

    // Validate inputs
    if (!title) {
        return reply.status(400).send({ error: 'Title is required' });
    }
    if (status && !['pending', 'completed'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid status value' });
    }

    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            'INSERT INTO tasks (title, description, status) VALUES ($1, $2, $3) RETURNING *',
            [title, description || '', status || 'pending']
        );
        return reply.send(rows[0]);
    } catch (err) {
        console.error('Failed to create task:', err);
        return reply.status(500).send({ error: 'Internal Server Error for create api' });
    } finally {
        client.release();
    }
});

// Retrieve a task by ID
server.get('/tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (rows.length === 0) {
            return reply.status(404).send({ error: 'Task not found' });
        }
        return reply.send(rows[0]);
    } catch (err) {
        console.error('Failed to retrieve task:', err);
        return reply.status(500).send({ error: 'Internal Server Error for retrieve task api' });
    } finally {
        client.release();
    }
});

// List all tasks
server.get('/tasks', async (request, reply) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM tasks ORDER BY created_at ASC');
        return reply.send(rows);
    } catch (err) {
        console.error('Failed to list tasks:', err);
        return reply.status(500).send({ error: 'Internal Server Error for List all data api' });
    } finally {
        client.release();
    }
});

// Update a task
server.put('/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, description, status } = request.body;

    if (status && !['pending', 'completed'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid status value, status must be pending or completed' });
    }

    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            'UPDATE tasks SET title = $1, description = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
            [title || '', description || '', status || 'pending', id]
        );
        if (rows.length === 0) {
            return reply.status(404).send({ error: 'Task not found' });
        }
        return reply.send(rows[0]);
    } catch (err) {
        console.error('Failed to update task:', err);
        return reply.status(500).send({ error: 'Internal Server Error for update details api' });
    } finally {
        client.release();
    }
});

// Delete a task
server.delete('/tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const client = await pool.connect();
    try {
        const { rowCount } = await client.query('DELETE FROM tasks WHERE id = $1', [id]);
        if (rowCount === 0) {
            return reply.status(404).send({ error: `Task not found with this ID ${id}` });
        }
        return reply.send({ message: `Task deleted successfully with this ID ${id}` });
    } catch (err) {
        console.error('Failed to delete task:', err);
        return reply.status(500).send({ error: 'Internal Server Error for delete data api' });
    } finally {
        client.release();
    }
});

// Start the server
server.listen({ port: 8080 }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is running at ${address}`);
});

// Integrate Fastify with Google Cloud Functions
http('fastifyFunction', async (req, res) => {
    await server.ready();
    server.server.emit('request', req, res);
});
