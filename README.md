# Router.so / Open Source Form Backend

<a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frouterso%2Frouter%2Ftree%2Fmain&env=RESEND_API_KEY,NEXTAUTH_SECRET,NODE_ENV,POSTGRES_URL&envDescription=NODE_ENV%20should%20be%20%60development%60.%20Resend%20will%20require%20an%20account%20to%20get%20an%20API%20key.&envLink=https%3A%2F%2Fgithub.com%2Frouterso%2Frouter%2Ftree%2Fmain%3Ftab%3Dreadme-ov-file%23prerequisites&project-name=router-so&repository-name=router-so"><img src="https://vercel.com/button" alt="Deploy with Vercel"/></a>

## Description

This is a simple router for forms. [Watch a Demo](https://x.com/youngbloodcyb/status/1831808232966516972)

Router supports optional first-class forms without changing its headless endpoint contract. Forms can be published on `forms.router.so`, embedded in an approved website, or rendered through the included WordPress block and shortcode. See [the Forms implementation notes](docs/forms/README.md) and [release runbook](docs/forms/release-runbook.md).

# Self-Hosting router

## Prerequisites

Before starting, ensure you have the following:

- An account with [Resend](https://resend.com/)
- An account with [Vercel](https://vercel.com/)
- A PostgreSQL database (we recommend [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres))

## Environment Variables

After creating your accounts, update your `.env.example` to be `.env.local` for running the application locally. Then, update the keys for each value.

## Step-by-Step Instructions

1. **Clone the Repository**

   ```sh
   git clone https://github.com/routerso/router.git
   cd router/main
   ```
### Without Docker

2. **Install Dependencies**

   This project uses [pnpm](https://pnpm.io/) (see `packageManager` in `package.json`).
   Install with pnpm so the `pnpm.overrides` security pins are applied — installing
   with npm or yarn ignores them and pulls vulnerable transitive dependencies.

   ```sh
   pnpm install --frozen-lockfile
   ```

3. **Set Up Environment Variables**

   Ensure your `.env` file is correctly configured as mentioned above.

4. **Generate the Database Migrations**

   ```sh
   pnpm db:generate
   ```

5. **Run the Database Migrations**

   ```sh
   pnpm db:migrate
   ```

6. **Start the Development Server**

   ```sh
   pnpm dev
   ```
### With docker

2. **Set Up Environment Variables**

   Ensure your `.env` file is correctly configured as mentioned above.

3. **Run Docker Command
   ```sh
   docker compose up
   ```
## Deploying to Vercel

- Push your code to a GitHub repository.
- Connect your repository to Vercel.
- Set the environment variables in Vercel's dashboard under "Settings > Environment Variables".

## Dependency Maintenance

Run `pnpm audit` to check for known vulnerabilities.

The `pnpm.overrides` block in `package.json` force-resolves transitive dependencies
that a direct dependency still pins to a vulnerable version (for example, `next`
pins `postcss` 8.4.31, and `tailwindcss` reaches a vulnerable `glob` via `sucrase`).
Each entry can be removed once the parent package ships a release that depends on a
patched version on its own — re-run `pnpm audit` after removing one to confirm.

Requires Node.js >= 20.9.0.

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Resend Documentation](https://resend.com/docs)

For any issues or questions, please open an issue on the [GitHub repository](https://github.com/routerso/router).
