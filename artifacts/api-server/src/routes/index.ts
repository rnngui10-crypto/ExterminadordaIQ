import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import accountRouter from "./account";
import assetsRouter from "./assets";
import signalsRouter from "./signals";
import priceRouter from "./price";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountRouter);
router.use(assetsRouter);
router.use(signalsRouter);
router.use(priceRouter);

export default router;
