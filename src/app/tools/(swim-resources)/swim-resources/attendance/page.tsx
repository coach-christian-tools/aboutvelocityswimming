"use client";
import Link from 'next/link';
import {useAuth} from '@/features/workshare/contexts/auth';
export default function AttendanceHome(){const {isAdmin,loading}=useAuth();return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl mb-4">Practice attendance</h1><p className="mb-6 text-text-secondary">Record attendance using the shared swimmer roster.</p>{loading?<p role="status">Checking your account…</p>:<Link className="inline-block rounded-lg bg-primary-blue text-white px-5 py-3" href={isAdmin?'/tools/swim-resources/attendance/admin':'/login'}>{isAdmin?'Open attendance':'Sign in'}</Link>}</main>;}
