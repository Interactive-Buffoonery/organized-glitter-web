import { lazy, type ComponentType } from 'react';
import { Navigate } from 'react-router-dom';

import type { SuspenseKind } from '@/components/routing/ProtectedLazyRoute';
import {
  ImportRedirect,
  LegacyNewColoringBookRedirect,
  ProfileListRedirect,
} from '@/components/routing/routeRedirects';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';

const RootRoute = lazy(() =>
  import('@/components/auth/RootRoute').then(module => ({ default: module.RootRoute }))
);
const About = lazy(() => import('@/pages/About'));
const ConfirmPasswordReset = lazy(() => import('@/pages/ConfirmPasswordReset'));
const EmailConfirmation = lazy(() => import('@/pages/EmailConfirmation'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const LinksPage = lazy(() => import('@/pages/LinksPage'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Register = lazy(() => import('@/pages/Register'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Terms = lazy(() => import('@/pages/Terms'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));

const Overview = lazy(() => import('@/pages/Overview'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const NewProject = lazy(() => import('@/pages/NewProjectRouter'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const EditProject = lazy(() => import('@/pages/EditProject'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword.tsx'));
const ChangeEmail = lazy(() => import('@/pages/ChangeEmail'));
const ConfirmEmailChange = lazy(() => import('@/pages/ConfirmEmailChange'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const Options = lazy(() => import('@/pages/Options'));
const CompanyList = lazy(() => import('@/pages/CompanyList'));
const ArtistList = lazy(() => import('@/pages/ArtistList'));
const TagList = lazy(() => import('@/pages/TagList'));
const BookPublisherList = lazy(() => import('@/pages/BookPublisherList'));
const BookIllustratorList = lazy(() => import('@/pages/BookIllustratorList'));
const ColoringMediumList = lazy(() => import('@/pages/ColoringMediumList'));
const Support = lazy(() => import('@/pages/Support'));
const SupportSuccess = lazy(() => import('@/pages/SupportSuccess'));
const ProjectRandomizer = lazy(() => import('@/pages/ProjectRandomizer'));
const Stats = lazy(() => import('@/pages/Stats'));
const NotesFeedPage = lazy(() => import('@/pages/NotesFeedPage'));
const ColoringDashboard = lazy(() => import('@/pages/ColoringDashboard'));
const EditColoringBook = lazy(() => import('@/pages/EditColoringBook'));
const ColoringBookDetail = lazy(() => import('@/pages/ColoringBookDetail'));
const ColoringPageDetail = lazy(() => import('@/pages/ColoringPageDetail'));

export type RouteVerticalAccess = 'public' | 'shared' | 'diamond_painting' | 'coloring_books';

export interface RouteMetadata {
  title: string;
  description?: string;
}

export interface RouteDef {
  path: string;
  element: ComponentType;
  verticalAccess: RouteVerticalAccess;
  metadata: RouteMetadata;
  pageOwnsMetadata?: boolean;
  protected?: boolean;
  errorBoundary?: string;
  errorBoundaryLabel?: string;
  suspense?: SuspenseKind;
}

export const APP_ROUTES: RouteDef[] = [
  {
    path: '/',
    element: RootRoute,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: {
      title: 'Organized Glitter | Coloring Book & Diamond Art Tracker',
      description:
        'Track coloring books, coloring pages, diamond art projects, stash status, progress photos, palettes, and mystery reveals in one craft tracker.',
    },
    pageOwnsMetadata: true,
  },

  {
    path: '/login',
    element: Login,
    verticalAccess: 'public',
    metadata: { title: 'Log in | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/register',
    element: Register,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Create account | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/forgot-password',
    element: ForgotPassword,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Reset password | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/reset-password',
    element: ResetPassword,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Reset password | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/auth/confirm-password-reset',
    element: ConfirmPasswordReset,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Confirm password reset | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/auth/confirm-password-reset/:token',
    element: ConfirmPasswordReset,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Confirm password reset | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/auth/verify-email/:token',
    element: VerifyEmail,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Verify email | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/email-confirmation',
    element: EmailConfirmation,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Email confirmation | Organized Glitter' },
    pageOwnsMetadata: true,
  },

  {
    path: '/overview',
    element: Overview,
    verticalAccess: 'shared',
    metadata: { title: 'Overview | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/dashboard',
    element: Dashboard,
    verticalAccess: 'shared',
    metadata: { title: 'Library | Organized Glitter' },
    protected: true,
    suspense: 'layout',
    errorBoundary: 'Dashboard',
    errorBoundaryLabel: 'Library',
  },
  {
    path: '/projects/new',
    element: NewProject,
    verticalAccess: 'shared',
    metadata: { title: 'New project | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/coloring',
    element: ColoringDashboard,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Coloring library | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/coloring/new',
    element: LegacyNewColoringBookRedirect,
    verticalAccess: 'shared',
    metadata: { title: 'New coloring book | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/coloring/:id',
    element: ColoringBookDetail,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Coloring book details | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/coloring/:id/edit',
    element: EditColoringBook,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Edit coloring book | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/coloring/:bookId/pages/:pageId',
    element: ColoringPageDetail,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Coloring page details | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/projects/:id',
    element: ProjectDetail,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Project details | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/projects/:id/edit',
    element: EditProject,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Edit project | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/profile',
    element: ProfileListRedirect,
    verticalAccess: 'shared',
    metadata: { title: 'Profile | Organized Glitter' },
    protected: true,
    suspense: 'layout',
    errorBoundary: 'Profile',
  },
  {
    path: '/change-password',
    element: ChangePassword,
    verticalAccess: 'shared',
    metadata: { title: 'Change password | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/change-email',
    element: ChangeEmail,
    verticalAccess: 'shared',
    metadata: { title: 'Change email | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/auth/confirm-email-change/:token',
    element: ConfirmEmailChange,
    verticalAccess: 'public',
    metadata: { title: 'Confirm email change | Organized Glitter' },
    pageOwnsMetadata: true,
    suspense: 'bare',
  },
  {
    path: '/delete-account',
    element: DeleteAccount,
    verticalAccess: 'shared',
    metadata: { title: 'Delete account | Organized Glitter' },
    pageOwnsMetadata: true,
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options',
    element: Options,
    verticalAccess: 'shared',
    metadata: { title: 'Options | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options/companies',
    element: CompanyList,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Companies | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options/artists',
    element: ArtistList,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Artists | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options/tags',
    element: TagList,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Tags | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options/publishers',
    element: BookPublisherList,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Book publishers | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options/illustrators',
    element: BookIllustratorList,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Book illustrators | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/options/coloring-mediums',
    element: ColoringMediumList,
    verticalAccess: 'coloring_books',
    metadata: { title: 'Coloring mediums | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/companies',
    element: () => <Navigate to="/options/companies" replace />,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Companies | Organized Glitter' },
    protected: true,
  },
  {
    path: '/artists',
    element: () => <Navigate to="/options/artists" replace />,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Artists | Organized Glitter' },
    protected: true,
  },
  {
    path: '/tags',
    element: () => <Navigate to="/options/tags" replace />,
    verticalAccess: 'diamond_painting',
    metadata: { title: 'Tags | Organized Glitter' },
    protected: true,
  },
  {
    path: '/import',
    element: ImportRedirect,
    verticalAccess: 'shared',
    metadata: { title: 'Data settings | Organized Glitter' },
    protected: true,
  },
  {
    path: '/support',
    element: Support,
    verticalAccess: 'public',
    metadata: {
      title: 'Support Organized Glitter',
      description:
        'Leave an optional one-time tip to help cover Organized Glitter hosting, database, and domain costs.',
    },
    suspense: 'layout',
  },
  {
    path: '/support/success',
    element: SupportSuccess,
    verticalAccess: 'public',
    metadata: { title: 'Thank you | Organized Glitter' },
    suspense: 'layout',
  },
  {
    path: '/randomizer',
    element: ProjectRandomizer,
    verticalAccess: 'shared',
    metadata: { title: 'Randomizer | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/stats',
    element: Stats,
    verticalAccess: 'shared',
    metadata: { title: 'Stats | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },
  {
    path: '/notes',
    element: NotesFeedPage,
    verticalAccess: 'shared',
    metadata: { title: 'Notes | Organized Glitter' },
    protected: true,
    suspense: 'layout',
  },

  {
    path: '/about',
    element: About,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'About | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/privacy',
    element: Privacy,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Privacy policy | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/terms',
    element: Terms,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Terms of service | Organized Glitter' },
    pageOwnsMetadata: true,
  },
  {
    path: '/links',
    element: LinksPage,
    suspense: 'bare',
    verticalAccess: 'public',
    metadata: { title: 'Links | Organized Glitter' },
    pageOwnsMetadata: true,
  },

  {
    path: '*',
    element: NotFound,
    verticalAccess: 'public',
    metadata: { title: 'Page not found | Organized Glitter' },
  },
];
