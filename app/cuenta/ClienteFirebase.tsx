"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthCredential,
  type UserCredential,
} from "firebase/auth";
import { auth } from "./firebaseCliente";
import { engancharCarritoConLaSesion } from "../tienda/carritoSesion";


export default function ClienteFirebase() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [modo, setModo] = useState<"entrar" | "crear">("entrar");
  const [credencialPendiente, setCredencialPendiente] = useState<AuthCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function abrirSesion(credencial: UserCredential) {
    const idToken = await credencial.user.getIdToken();
    const respuesta = await fetch("/api/clientes/sesion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
    });

    if (!respuesta.ok) {
      setError(
        respuesta.status === 429
          ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
          : "No pudimos abrir tu sesión. Intenta de nuevo.",
      );
      return;
    }

    // La sesión ya está abierta: hay que fusionar el carrito anónimo **ahora**. Esta
    // navegación no remonta el layout, así que el sincronizador que vive allí no se
    // enteraría hasta la siguiente recarga y el cliente vería su carrito local intacto.
    // Si la fusión falla no se bloquea la entrada: el carrito local se conserva entero y
    // se reintenta con el mismo token.
    await engancharCarritoConLaSesion(true);

    router.replace("/cuenta");
    router.refresh();
  }

  async function conCorreo(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setOcupado(true);

    try {
      const credencial =
        modo === "crear"
          ? await createUserWithEmailAndPassword(auth(), correo, clave)
          : await signInWithEmailAndPassword(auth(), correo, clave);
      await abrirSesion(credencial);
    } catch {
      setError(
        modo === "crear"
          ? "No pudimos crear la cuenta. Revisa el correo y usa una contraseña más segura."
          : "Correo o contraseña incorrectos.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function conGoogle() {
    setError(null);
    setOcupado(true);

    try {
      await abrirSesion(await signInWithPopup(auth(), new GoogleAuthProvider()));
    } catch (fallo) {
      const errorDeFirebase = fallo as FirebaseError & { customData?: { email?: string } };
      if (errorDeFirebase.code !== "auth/account-exists-with-different-credential") {
        setError("No pudimos entrar con Google. Intenta de nuevo.");
        return;
      }

      const correoEnConflicto = errorDeFirebase.customData?.email;
      const pendiente = GoogleAuthProvider.credentialFromError(errorDeFirebase);
      const metodos = correoEnConflicto
        ? await fetchSignInMethodsForEmail(auth(), correoEnConflicto)
        : [];

      if (!correoEnConflicto || !pendiente || !metodos.includes("password")) {
        setError("Ese correo ya tiene cuenta con otro método de acceso.");
        return;
      }

      setCorreo(correoEnConflicto);
      setModo("entrar");
      setCredencialPendiente(pendiente);
      setError(
        "Ese correo ya tiene cuenta con contraseña. Escríbela para enlazar el acceso con Google.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function enlazarGoogle(evento: React.FormEvent) {
    evento.preventDefault();
    if (!credencialPendiente) return;

    setOcupado(true);
    try {
      const existente = await signInWithEmailAndPassword(auth(), correo, clave);
      const enlazada = await linkWithCredential(existente.user, credencialPendiente);
      await abrirSesion(enlazada);
    } catch {
      setError("No pudimos enlazar las dos formas de entrar.");
    } finally {
      setOcupado(false);
    }
  }

  const enlazando = credencialPendiente !== null;

  return (
    <div className="mt-8 space-y-6">
      <button
        type="button"
        onClick={conGoogle}
        disabled={ocupado}
        className="w-full rounded border border-[#001B59] px-4 py-3 text-[#001B59] disabled:opacity-50"
      >
        Continuar con Google
      </button>

      <form onSubmit={enlazando ? enlazarGoogle : conCorreo} className="space-y-3">
        <label className="block text-sm text-neutral-700">
          Correo
          <input
            type="email"
            required
            autoComplete="email"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-neutral-700">
          Contraseña
          <input
            type="password"
            required
            minLength={6}
            autoComplete={modo === "crear" ? "new-password" : "current-password"}
            value={clave}
            onChange={(evento) => setClave(evento.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={ocupado}
          className="w-full rounded bg-[#E11133] px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {enlazando ? "Enlazar y entrar" : modo === "crear" ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      {enlazando ? null : (
        <button
          type="button"
          onClick={() => {
            setModo(modo === "entrar" ? "crear" : "entrar");
            setError(null);
          }}
          className="w-full text-sm text-[#001B59] underline"
        >
          {modo === "entrar" ? "Crear cuenta" : "Ya tengo cuenta"}
        </button>
      )}

      {error ? <p className="text-sm text-[#E11133]">{error}</p> : null}
    </div>
  );
}
