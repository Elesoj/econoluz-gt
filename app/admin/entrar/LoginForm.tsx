"use client";

import { useActionState } from "react";
import { Button } from "../../components/ui/Button";
import { entrar, type EstadoAcceso } from "../actions";

/**
 * Un solo mensaje para credenciales equivocadas y para correos que no existen:
 * separarlos convertiría el formulario en un comprobador de qué cuentas hay
 * dadas de alta.
 */
const MENSAJES: Record<EstadoAcceso["status"], string> = {
  inicial: "",
  invalid: "No se pudo iniciar sesión con esos datos.",
  blocked:
    "No se pudo iniciar sesión con esos datos. Inténtalo de nuevo dentro de unos minutos.",
  unavailable: "El servicio no está disponible ahora mismo. Inténtalo en unos minutos.",
};

/**
 * Vive aquí y no en `actions.ts` porque un módulo "use server" solo puede
 * exportar funciones asíncronas.
 */
const ESTADO_INICIAL: EstadoAcceso = { status: "inicial", email: "" };

export default function LoginForm() {
  const [estado, enviar, pendiente] = useActionState(entrar, ESTADO_INICIAL);
  const mensaje = MENSAJES[estado.status];

  return (
    <form action={enviar} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-semibold text-proyectos">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={estado.email}
          className="min-h-11 rounded-xl border border-proyectos/25 bg-white px-4 text-base text-proyectos"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-semibold text-proyectos">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11 rounded-xl border border-proyectos/25 bg-white px-4 text-base text-proyectos"
        />
      </div>

      {mensaje ? (
        // `role="alert"` para que un lector de pantalla anuncie el fallo sin
        // tener que volver a recorrer el formulario.
        <p role="alert" className="border-l-2 border-error pl-3 text-sm text-error">
          {mensaje}
        </p>
      ) : null}

      {/* El rojo de marca señala la acción principal de la pantalla, que aquí
          es la única: entrar. Ver docs/CONTINUAR-PANEL.md §4.4. */}
      <Button type="submit" variant="tienda" isFullWidth disabled={pendiente}>
        {pendiente ? "Comprobando…" : "Entrar"}
      </Button>
    </form>
  );
}
