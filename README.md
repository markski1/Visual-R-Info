# Visual R-Info

Visual R-Info es una implementación web del entorno educativo R-Info. Te deja escribir, validar y ejecutar programas completos en el navegador, observar la ciudad y avanzar paso a paso para entender el recorrido de los robots, sin las inconveniencas y limites del entorno original en Java.

R-Info es un lenguaje y entorno educativo de la Facultad de Informática de la Universidad Nacional de La Plata (UNLP). Visual R-Info es un proyecto independiente basado en ese entorno. **No es una aplicación oficial de la UNLP!**

## Tecnologías

El proyecto fue desarrollado por [Markski](https://markski.ar) en TypeScript con SvelteKit y Svelte. Usa CodeMirror para el editor de código, Canvas para representar la ciudad y Tailwind CSS con shadcn-svelte para la interfaz gráfica.

## Lenguaje y runtime

Para conocer cómo se analiza y ejecuta R-Info en esta implementación (lexer, parser, AST, análisis semántico, escenarios, runtime, eventos y CMRE) mirá [LENGUAJE.md](LENGUAJE.md).

## Documentación de referencia

La implementación toma como referencia, ademas de mi experiencia con el programa, y el material que se da en la clase del primer semestre, material institucional publicado por la Facultad de Informática de la UNLP:

- [Guía de Introducción a la Informática 2024](https://www.info.unlp.edu.ar/wp-content/uploads/2024/01/GuiaIAI2024.pdf)
- [Guía de Introducción a la Informática 2021](https://www.info.unlp.edu.ar/wp-content/uploads/2021/02/Guia_IAI_2021_V2.pdf)

Estas guías describen el ambiente, la estructura de los programas y las operaciones del robot.

## Desarrollo local

Se requiere Node.js 20.19 LTS o una versión igual o posterior a 22.12, además de pnpm 11.7.

```sh
pnpm install
pnpm dev
```

Para ejecutar todos los controles del proyecto:

```sh
pnpm validate
```

Para evitar cagadas con ataques de supply chain, el lockfile es completamente estricto La instalación falla si `package.json` y `pnpm-lock.yaml` no coinciden, asi que ojo al updatear.
