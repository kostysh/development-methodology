# Use the project-approved runtime with its offline suite dependencies.
ARG VERIFY_BASE=postgres@sha256:3a82e1f56c8f0f5616a11103ac3d47e632c3938698946a7ad26da0df1334744a
FROM ${VERIFY_BASE}
COPY --chmod=0555 verify /opt/verify
COPY --chmod=0555 cases/ /opt/cases/
COPY full.list docs.list /opt/
USER 65534:65534
ENTRYPOINT ["/opt/verify"]
