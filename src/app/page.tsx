import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/better-auth";
import { getSession } from "~/server/better-auth/server";

function getString(formData: FormData, key: string) {
	const value = formData.get(key);
	return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
	if (error instanceof APIError) return error.message;
	if (error instanceof Error) return error.message;
	return "Something went wrong";
}

async function signIn(formData: FormData) {
	"use server";
	let error: string | undefined;
	try {
		await auth.api.signInEmail({
			body: {
				email: getString(formData, "email"),
				password: getString(formData, "password"),
			},
			headers: await headers(),
		});
	} catch (e) {
		error = errorMessage(e);
	}
	redirect(error ? `/?error=${encodeURIComponent(error)}` : "/");
}

async function signUp(formData: FormData) {
	"use server";
	let error: string | undefined;
	try {
		await auth.api.signUpEmail({
			body: {
				name: getString(formData, "name"),
				email: getString(formData, "email"),
				password: getString(formData, "password"),
			},
			headers: await headers(),
		});
	} catch (e) {
		error = errorMessage(e);
	}
	redirect(error ? `/?error=${encodeURIComponent(error)}` : "/");
}

async function signOut() {
	"use server";
	await auth.api.signOut({ headers: await headers() });
	redirect("/");
}

const inputClass =
	"rounded-md bg-white/10 px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[hsl(280,100%,70%)]";
const buttonClass =
	"rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20";

export default async function Home({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const [session, { error }] = await Promise.all([getSession(), searchParams]);

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
			<div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
				<h1 className="font-extrabold text-5xl tracking-tight sm:text-[5rem]">
					Create <span className="text-[hsl(280,100%,70%)]">T3</span> App
				</h1>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
					<Link
						className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
						href="https://create.t3.gg/en/usage/first-steps"
						target="_blank"
					>
						<h3 className="font-bold text-2xl">First Steps →</h3>
						<div className="text-lg">
							Just the basics - Everything you need to know to set up your
							database and authentication.
						</div>
					</Link>
					<Link
						className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
						href="https://create.t3.gg/en/introduction"
						target="_blank"
					>
						<h3 className="font-bold text-2xl">Documentation →</h3>
						<div className="text-lg">
							Learn more about Create T3 App, the libraries it uses, and how to
							deploy it.
						</div>
					</Link>
				</div>
				<div className="flex flex-col items-center gap-4">
					{error && (
						<p className="rounded-md bg-red-500/20 px-4 py-2 text-red-200">
							{error}
						</p>
					)}
					{session ? (
						<div className="flex flex-col items-center gap-4">
							<p className="text-center text-2xl text-white">
								Logged in as {session.user.name}
							</p>
							<form action={signOut}>
								<button className={buttonClass} type="submit">
									Sign out
								</button>
							</form>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
							<form action={signIn} className="flex flex-col gap-3">
								<h2 className="font-bold text-2xl">Sign in</h2>
								<input
									autoComplete="email"
									className={inputClass}
									name="email"
									placeholder="Email"
									required
									type="email"
								/>
								<input
									autoComplete="current-password"
									className={inputClass}
									minLength={8}
									name="password"
									placeholder="Password"
									required
									type="password"
								/>
								<button className={buttonClass} type="submit">
									Sign in
								</button>
							</form>
							<form action={signUp} className="flex flex-col gap-3">
								<h2 className="font-bold text-2xl">Sign up</h2>
								<input
									autoComplete="name"
									className={inputClass}
									name="name"
									placeholder="Name"
									required
									type="text"
								/>
								<input
									autoComplete="email"
									className={inputClass}
									name="email"
									placeholder="Email"
									required
									type="email"
								/>
								<input
									autoComplete="new-password"
									className={inputClass}
									minLength={8}
									name="password"
									placeholder="Password (min 8 chars)"
									required
									type="password"
								/>
								<button className={buttonClass} type="submit">
									Sign up
								</button>
							</form>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
