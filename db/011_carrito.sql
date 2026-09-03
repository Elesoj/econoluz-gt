-- El carrito de un cliente con sesión. Dos tablas, las del diseño §5.4.
--
-- **El carrito anónimo no está aquí.** Sigue viviendo solo en el navegador: guardar el de
-- cada visitante llenaría la base de basura que nadie reclama nunca. En Neon solo existe
-- el carrito de quien ha iniciado sesión, y por eso `carts` cuelga de `users`.
--
-- Lo que se guarda es **qué y cuánto**, nada más. Ni precios, ni nombres, ni imágenes, ni
-- datos del proveedor, ni existencias —que además ECONOLUZ no maneja—. El importe se
-- recalcula siempre contra el catálogo del servidor: un precio guardado aquí acabaría
-- siendo un precio que el navegador puede llegar a fijar.
--
-- Aditiva, transaccional y repetible, como las diez anteriores.

create table if not exists carts (
  id             bigserial   primary key,
  -- Único: un cliente tiene **un** carrito activo. Eso convierte «créalo si no existe» en
  -- un `on conflict do nothing` y hace imposible que dos peticiones simultáneas creen dos.
  user_id        bigint      not null unique references users(id) on delete cascade,
  -- Los tokens de las últimas fusiones aplicadas, el más reciente primero.
  --
  -- Son **los últimos, no el último**. Guardar uno solo deja una puerta abierta: el
  -- navegador conserva su token hasta que la fusión le consta confirmada, así que un
  -- reintento normal repite el mismo y se reconoce; pero una petición duplicada que llega
  -- **tarde** —el reintento de un proxy, una pestaña colgada, una respuesta perdida
  -- seguida de otro inicio de sesión— trae un token anterior, y con un solo hueco la
  -- fusión se aplicaría por segunda vez. El cliente se encontraría el doble de todo.
  --
  -- La lista va acotada en la aplicación: es una defensa contra duplicados retrasados, no
  -- un registro histórico de por dónde ha entrado nadie.
  fusion_tokens  jsonb       not null default '[]'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists cart_items (
  id             bigserial   primary key,
  cart_id        bigint      not null references carts(id) on delete cascade,
  -- Apunta a la clave interna del producto, no a la referencia pública: la referencia es
  -- lo que habla el navegador, y guardar los dos identificadores del mismo producto es
  -- guardarse la posibilidad de que un día no coincidan.
  product_id     text        not null references products(id) on delete cascade,
  -- El tope de 999 es el mismo del carrito local (`CANTIDAD_MAXIMA_POR_LINEA`). No es una
  -- regla de negocio: es un freno para que un formulario manipulado no pida un millón de
  -- piezas. Quien necesita más está haciendo un proyecto, y para eso está la asesoría.
  cantidad       integer     not null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint cart_items_cantidad_valida check (cantidad between 1 and 999),
  -- Una fila por producto: dos filas del mismo producto en el mismo carrito son la misma
  -- línea contada dos veces.
  constraint cart_items_uno_por_producto unique (cart_id, product_id)
);

create index if not exists cart_items_cart_id_idx on cart_items (cart_id);

-- El rol público no tiene nada que hacer aquí: el carrito es privado de su dueño y se lee
-- con la conexión de la aplicación, ya acotada por el usuario verificado.
--
-- Se revoca de forma explícita en vez de confiar en no haberle concedido nada: una
-- concesión futura por descuido —un `grant select on all tables`— pasaría inadvertida, y
-- así al menos queda escrito de quién es esta puerta y que está cerrada.
revoke all on carts from econoluz_publico;
revoke all on cart_items from econoluz_publico;
revoke all on sequence carts_id_seq from econoluz_publico;
revoke all on sequence cart_items_id_seq from econoluz_publico;
