'use client';
import {lazy,Suspense} from 'react';
import {MainLayout} from './components/layout/MainLayout';
import {ProtectedRoute} from './components/auth/ProtectedRoute';
const Login=lazy(()=>import('./components/auth/Login').then(m=>({default:m.Login})));
const Guest=lazy(()=>import('./components/guest/GuestProxy').then(m=>({default:m.GuestProxy})));
const Dashboard=lazy(()=>import('./components/dashboard/FamilyDashboard').then(m=>({default:m.FamilyDashboard})));
const Jobs=lazy(()=>import('./components/jobs/JobBoard').then(m=>({default:m.JobBoard})));
const Logs=lazy(()=>import('./components/dashboard/VolunteerLogs').then(m=>({default:m.VolunteerLogs})));
const Families=lazy(()=>import('./components/admin/Families').then(m=>({default:m.FamiliesAdmin})));
const Family=lazy(()=>import('./components/admin/FamilyDetail').then(m=>({default:m.FamilyDetailAdmin})));
const Registrations=lazy(()=>import('./components/admin/Registrations').then(m=>({default:m.RegistrationsAdmin})));
const Settings=lazy(()=>import('./components/admin/Settings').then(m=>({default:m.Settings})));
const views={login:Login,guest:Guest,dashboard:Dashboard,jobs:Jobs,logs:Logs,families:Families,family:Family,registrations:Registrations,settings:Settings};
export type WorkshareView=keyof typeof views;
export default function App({view}:{view:WorkshareView}){const View=views[view];const isAdmin=['families','family','registrations','settings'].includes(view);return <Suspense fallback={<p role="status" className="p-8">Loading Workshare…</p>}>{['login','guest'].includes(view)?<View/>:<ProtectedRoute requireAdmin={isAdmin}><MainLayout isAdmin={isAdmin}><View/></MainLayout></ProtectedRoute>}</Suspense>;}
