"use client";
import Link from 'next/link';
import {useAuth} from '@/features/workshare/contexts/auth';
import ThemeToggle from './ThemeToggle';
export default function AdminLoginFooter(){const {isAdmin}=useAuth();return <footer className="mt-12 border-t border-border py-6 text-center text-sm text-text-secondary"><div className="mb-3"><ThemeToggle/></div><Link className="underline" href={isAdmin?'/tools/swim-resources/admin':'/login'}>{isAdmin?'Open coaching tools':'Staff sign in'}</Link></footer>;}
