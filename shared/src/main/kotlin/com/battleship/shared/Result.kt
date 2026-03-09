package com.battleship.shared

sealed class Result<out S, out F> {

    data class Success<S>(val value: S) : Result<S, Nothing>()
    data class Failure<F>(val reason: F) : Result<Nothing, F>()

    fun <T> map(transform: (S) -> T): Result<T, F> = when (this) {
        is Success -> Success(transform(value))
        is Failure -> this
    }

    fun <T> flatMap(transform: (@UnsafeVariance S) -> Result<T, @UnsafeVariance F>): Result<T, F> = when (this) {
        is Success -> transform(value)
        is Failure -> this
    }

    fun <T> mapFailure(transform: (@UnsafeVariance F) -> T): Result<S, T> = when (this) {
        is Success -> this
        is Failure -> Failure(transform(reason))
    }

    fun or(fallback: (F) -> @UnsafeVariance S): S = when (this) {
        is Success -> value
        is Failure -> fallback(reason)
    }

    fun <T> either(onSuccess: (S) -> T, onFailure: (F) -> T): T = when (this) {
        is Success -> onSuccess(value)
        is Failure -> onFailure(reason)
    }
}

fun <S> S.asSuccess(): Result<S, Nothing> = Result.Success(this)
fun <F> F.asFailure(): Result<Nothing, F> = Result.Failure(this)
